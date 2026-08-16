import {
  ProgramKey,
  ProgressState,
  Role,
  StageKind,
  StudentState,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { isActiveArifForCircle, autoDismissArifIfBelowThreshold } from "./arif";
import { displayBoundary } from "./maraqi";
import { getConsolidation, getWeeklyReview, type ConsolidationView, type WeeklyReview } from "./tarseekh";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ الجلسة اليومية (م٤ب — DESIGN §٨٫٣) ═══════════════
//
// جلسة مراقي ثلاثية: الحفظ (المعلم وحده — لا يُوكَّل، م٢) + الترسيخ + المراجعة.
// هذه الدفعة (بقرار النطاق): الشاشة + التسجيل الأساسي — الحفظ (النطاق/المحاولات/أتقن)
// والترسيخ/المراجعة «تمّ/لم يتم». نافذة الترسيخ الآلية (٩ أيام) والخُمس وتوكيل العريف
// مؤجَّلة لدفعةٍ تالية (وقاعدة النافذة حينها: **بالمقاطع** — آخر ٩ مقاطع محفوظة).

/** يحوّل مدخلًا إلى تاريخٍ بلا وقت (منتصف ليل UTC) — يطابق @db.Date. */
function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) throw new ValidationError("تاريخ غير صالح.");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ترتيب موضعٍ قرآنيّ: (سورة، آية) ≤ (سورة، آية). */
function pointLE(s1: number, a1: number, s2: number, a2: number): boolean {
  return s1 < s2 || (s1 === s2 && a1 <= a2);
}
function inRange(
  s: number, a: number,
  fromS: number, fromA: number, toS: number, toA: number,
): boolean {
  return pointLE(fromS, fromA, s, a) && pointLE(s, a, toS, toA);
}

// ═══════════════ حدود الرصد ═══════════════

interface StudentCircle {
  studentId: string;
  circleId: string;
  programKey: ProgramKey;
}

/** الحلقة النشطة للطالب وبرنامجها (أو خطأ إن لم يكن منتسبًا). */
async function activeCircle(
  studentId: string,
  db: PrismaClient | Prisma.TransactionClient,
): Promise<StudentCircle> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { circleId: true, circle: { select: { program: { select: { key: true } } } } },
  });
  if (!enrollment) throw new ValidationError("الطالب غير منتسبٍ لحلقة نشطة.");
  return { studentId, circleId: enrollment.circleId, programKey: enrollment.circle.program.key };
}

/**
 * المعلم يرصد جلسة طلابه فقط (§٨٫٣: الحفظ على المعلم وحده). المدير/المشرف كادرٌ مخوّل.
 * معلمٌ ليس معلمَ الطالب ← يُرفض في الخادم (اختبار القبول).
 */
export async function assertTeachesStudent(
  actorId: string,
  studentId: string,
  db: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<StudentCircle> {
  const sc = await activeCircle(studentId, db);
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) return sc;

  const link = await db.circleTeacher.findFirst({
    where: { circleId: sc.circleId, teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  if (!link) throw new AuthorizationError("لا تَرصد إلا جلسات طلابك (§٨٫٣).");
  return sc;
}

// ═══════════════ موضع الطالب الحاليّ ═══════════════

export interface StudentPosition {
  program: ProgramKey;
  started: boolean;
  /** المرحلة الحالية — الحزب (مراقي) أو الباب (القاعدة المدنية). null إن لم يبدأ. */
  current: {
    stageId: string;
    label: string;
    hizb: number | null; // لمراقي (شاشة المعلم)
    fromSurah: number | null;
    fromAyah: number | null;
    toSurah: number | null;
    toAyah: number | null;
  } | null;
}

/**
 * موضع الطالب الحاليّ في سلّمه (§٨٫٢). لمراقي (تنازليّ): المرحلة الفرعية التي تحوي
 * **جبهة الحفظ** = أدنى موضعٍ حُفظ (min سورة:آية عبر جلساته). للقاعدة المدنية: الباب
 * الجاري (StageProgress IN_PROGRESS). فارغٌ بأمان قبل أول جلسة/تقدّم.
 */
export async function getStudentPosition(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<StudentPosition> {
  const sc = await activeCircle(studentId, db);

  if (sc.programKey === ProgramKey.MARAQI) {
    const sessions = await db.dailySession.findMany({
      where: { studentId, hifzFromSurah: { not: null } },
      select: { hifzFromSurah: true, hifzFromAyah: true },
    });
    if (sessions.length === 0) return { program: sc.programKey, started: false, current: null };

    // جبهة الحفظ = أدنى (سورة، آية) بدايةً (مراقي ينزل من الناس إلى البقرة).
    let fS = Infinity, fA = Infinity;
    for (const s of sessions) {
      const s1 = s.hifzFromSurah as number, a1 = s.hifzFromAyah ?? 1;
      if (s1 < fS || (s1 === fS && a1 < fA)) { fS = s1; fA = a1; }
    }

    const program = await db.program.findUnique({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
    const subs = program
      ? await db.stage.findMany({
          where: { programId: program.id, kind: StageKind.SUB_STAGE },
          select: {
            id: true, nameAr: true, hizbNumber: true,
            fromSurah: true, fromAyah: true, toSurah: true, toAyah: true,
          },
        })
      : [];
    const cur = subs.find(
      (s) =>
        s.fromSurah != null && s.fromAyah != null && s.toSurah != null && s.toAyah != null &&
        inRange(fS, fA, s.fromSurah, s.fromAyah, s.toSurah, s.toAyah),
    );
    return {
      program: sc.programKey,
      started: true,
      current: cur
        ? {
            stageId: cur.id, label: displayBoundary(cur.nameAr), hizb: cur.hizbNumber,
            fromSurah: cur.fromSurah, fromAyah: cur.fromAyah, toSurah: cur.toSurah, toAyah: cur.toAyah,
          }
        : null,
    };
  }

  // القاعدة المدنية: الباب الجاري.
  const progress = await db.stageProgress.findFirst({
    where: {
      studentId,
      state: ProgressState.IN_PROGRESS,
      stage: { kind: StageKind.CHAPTER, program: { key: ProgramKey.QAIDAH_MADANIYYAH } },
    },
    select: { stage: { select: { id: true, nameAr: true } } },
    orderBy: { stage: { ordinal: "asc" } },
  });
  return {
    program: sc.programKey,
    started: progress != null,
    current: progress
      ? {
          stageId: progress.stage.id, label: progress.stage.nameAr, hizb: null,
          fromSurah: null, fromAyah: null, toSurah: null, toAyah: null,
        }
      : null,
  };
}

// ═══════════════ تسجيل الجلسة ═══════════════

async function upsertSession(
  tx: Prisma.TransactionClient,
  studentId: string,
  circleId: string,
  date: Date,
  data: Prisma.DailySessionUncheckedUpdateInput & Prisma.DailySessionUncheckedCreateInput,
): Promise<void> {
  await tx.dailySession.upsert({
    where: { studentId_date: { studentId, date } },
    update: data,
    create: { ...data, studentId, circleId, date },
  });
}

export interface HifzInput {
  studentId: string;
  date: string | Date;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  attempts: number;
  mastered: boolean;
  teacherId: string;
}

/** الحكم ١: الفرص الثلاث — أي خطأ = رسوب المحاولة، وثلاثُ محاولاتٍ حدٌّ أقصى. */
export const MAX_HIFZ_ATTEMPTS = 3;

interface PriorHifz {
  fromSurah: number; fromAyah: number; toSurah: number; toAyah: number;
}

/**
 * أحدثُ جلسة حفظٍ سابقة لم تُتقَن (رسبت فرصها الثلاث). إن وُجدت فالحكم ١ يوجب إعادة
 * **نفس المقطع** في يوم الحلقة التالي — لا حفظ جديد. تعيد نطاقها، أو null إن أُتقن السابق.
 */
async function priorUnmasteredRange(
  studentId: string, date: Date, db: PrismaClient | Prisma.TransactionClient,
): Promise<PriorHifz | null> {
  const prior = await db.dailySession.findFirst({
    where: { studentId, hifzFromSurah: { not: null }, date: { lt: date } },
    orderBy: { date: "desc" },
    select: {
      hifzMastered: true,
      hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true,
    },
  });
  if (!prior || prior.hifzMastered === true) return null;
  return {
    fromSurah: prior.hifzFromSurah as number, fromAyah: prior.hifzFromAyah as number,
    toSurah: prior.hifzToSurah as number, toAyah: prior.hifzToAyah as number,
  };
}

/**
 * الحفظ — المعلم وحده (§٨٫٣): النطاق + عدد المحاولات + أتقن. لمراقي فقط.
 * الحكم ١ (قواعد مطلقة): المحاولات ١..٣؛ ولا حفظ جديد قبل إتقان مقطع اليوم السابق —
 * إن رسب أمس فاليوم يعيد **نفس المقطع** لا غيره.
 */
export async function recordHifz(input: HifzInput, db: PrismaClient = prisma): Promise<void> {
  const sc = await assertTeachesStudent(input.teacherId, input.studentId, db);
  if (sc.programKey !== ProgramKey.MARAQI) {
    throw new ValidationError("الجلسة اليومية لطلاب مراقي.");
  }
  const student = await db.student.findUnique({ where: { id: input.studentId }, select: { state: true } });
  if (student?.state !== StudentState.IN_MARAQI) {
    throw new ValidationError("تسجيل الحفظ لطالبٍ في مراقي.");
  }
  if (!pointLE(input.fromSurah, input.fromAyah, input.toSurah, input.toAyah)) {
    throw new ValidationError("نطاق الحفظ معكوس (البداية بعد النهاية).");
  }
  if (!Number.isInteger(input.attempts) || input.attempts < 1 || input.attempts > MAX_HIFZ_ATTEMPTS) {
    throw new ValidationError("عدد المحاولات بين ١ و٣ (الفرص الثلاث — الحكم ١).");
  }
  const date = toDateOnly(input.date);

  // الحكم ١: لا حفظ جديد قبل إتقان السابق — يُعاد نفس المقطع.
  const repeat = await priorUnmasteredRange(input.studentId, date, db);
  if (repeat) {
    const same = repeat.fromSurah === input.fromSurah && repeat.fromAyah === input.fromAyah &&
      repeat.toSurah === input.toSurah && repeat.toAyah === input.toAyah;
    if (!same) {
      throw new ValidationError("لا حفظ جديد قبل إتقان مقطع اليوم السابق — أعِد المقطع نفسه (الحكم ١).");
    }
  }
  await db.$transaction(async (tx) => {
    await upsertSession(tx, input.studentId, sc.circleId, date, {
      studentId: input.studentId, circleId: sc.circleId, date,
      hifzFromSurah: input.fromSurah, hifzFromAyah: input.fromAyah,
      hifzToSurah: input.toSurah, hifzToAyah: input.toAyah,
      hifzAttempts: input.attempts, hifzMastered: input.mastered, hifzTeacherId: input.teacherId,
    });
    await emitEvent(tx, {
      type: "HIFZ_RECORDED",
      subjectType: "Student",
      subjectId: input.studentId,
      actorId: input.teacherId,
      payload: { attempts: input.attempts, mastered: input.mastered },
    });
  });
}

export interface ConsolidationInput {
  studentId: string;
  date: string | Date;
  done: boolean;
  /** المعلّم الذي يسجّل ويتحمّل المسؤولية (يُتحقَّق: معلّم الطالب — الحكم ٦). */
  actorId: string;
  /** من سمّع فعلاً: المعلّم نفسه أو مُسنَدٌ إليه (بما فيهم العريف). افتراضه actorId. */
  listenerId?: string;
}

/**
 * منطق التسميع (الحكمان ٦ و٨): **مرن** — لا يشترط الحياد. يُسجّله ويتحمّل مسؤوليته
 * **معلّم الحلقة** (أو المدير)، **أو عريفٌ مُسنَدٌ نشطٌ في حلقة الطالب** (الحكم ٨). يختلف
 * عن **الاختبار** (assertCanExamine) الذي يشترط الحياد. فالمعلّم/العريف يُسمِّع الترسيخ
 * والمراجعة (مسموح)، ولا يُسمِّع العريفُ الحفظَ الجديد (recordHifz للمعلّم وحده)، ولا يختبر.
 */
export async function assertCanRecordListening(
  actorId: string,
  studentId: string,
  db: PrismaClient = prisma,
): Promise<StudentCircle> {
  const sc = await activeCircle(studentId, db);
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (actor?.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) return sc;
  const teaches = await db.circleTeacher.findFirst({
    where: { circleId: sc.circleId, teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  if (teaches) return sc;
  if (await isActiveArifForCircle(actorId, sc.circleId, db)) return sc; // الحكم ٨
  throw new AuthorizationError("التسميع لمعلّم الحلقة أو عريفٍ مُسنَدٍ فيها (الأحكام ٦، ٨).");
}

/** الترسيخ — «تمّ/لم يتم فقط» (§٨٫٣). تسميعٌ مرن: المعلّم يُسمِّع أو يُسنِد (الحكم ٦). */
export async function recordTarseekh(input: ConsolidationInput, db: PrismaClient = prisma): Promise<void> {
  const sc = await assertCanRecordListening(input.actorId, input.studentId, db);
  const listener = input.listenerId ?? input.actorId;
  const date = toDateOnly(input.date);
  await db.$transaction(async (tx) => {
    await upsertSession(tx, input.studentId, sc.circleId, date, {
      studentId: input.studentId, circleId: sc.circleId, date,
      tarseekhDone: input.done, tarseekhListenerId: listener,
    });
    await emitEvent(tx, {
      type: "TARSEEKH_RECORDED", subjectType: "Student", subjectId: input.studentId,
      actorId: input.actorId,
      payload: { done: input.done, listenerId: listener, delegated: listener !== input.actorId },
    });
  });
}

export interface MurajaahInput {
  studentId: string;
  date: string | Date;
  /** مقدار ما رُوجِع اليوم (عدد المقاطع) — يتراكم أسبوعيًّا (الحكم ٤ الموسّع). */
  count: number;
  actorId: string;
  listenerId?: string;
}

/**
 * المراجعة — الحكم ٤ الموسّع: يُرصد **مقدار** ما سُمِّع اليوم (لا بوليّ فقط)، فيتراكم
 * أسبوعيًّا. تسميعٌ مرن: المعلّم يُسمِّع أو يُسنِد (الحكم ٦). done مشتقّ (مقدارٌ موجب = تمّ).
 */
export async function recordMurajaah(input: MurajaahInput, db: PrismaClient = prisma): Promise<void> {
  const sc = await assertCanRecordListening(input.actorId, input.studentId, db);
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new ValidationError("مقدار المراجعة غير صالح (عددٌ صحيحٌ ≥ ٠).");
  }
  const listener = input.listenerId ?? input.actorId;
  const date = toDateOnly(input.date);
  await db.$transaction(async (tx) => {
    await upsertSession(tx, input.studentId, sc.circleId, date, {
      studentId: input.studentId, circleId: sc.circleId, date,
      murajaahCount: input.count, murajaahDone: input.count > 0, murajaahListenerId: listener,
    });
    await emitEvent(tx, {
      type: "MURAJAAH_RECORDED", subjectType: "Student", subjectId: input.studentId,
      actorId: input.actorId,
      payload: { count: input.count, listenerId: listener, delegated: listener !== input.actorId },
    });
  });
}

// ═══════════════ الترميم الموضعيّ (الحكم ٥) ═══════════════

/** الحكم ٥: نافذة عدّ الأخطاء = آخر ١٠ جلسات حفظ (تطابق نافذة الترسيخ). */
export const REVIEW_ERROR_WINDOW = 10;

export interface ReviewErrorInput {
  studentId: string;
  sessionId: string; // جلسة الحفظ (المقطع) التي رُوجِعت
  date: string | Date; // يوم رصد المراجعة
  errorCount: number; // أخطاء هذه المراجعة (تُسجَّل سطورًا)
  actorId: string; // المعلّم أو المُسنَد (الحكم ٦)
}

/**
 * رصد أخطاء مراجعة مقطعٍ (الحكم ٥، قرار محمد): العدّ **تراكميّ** على المقطع داخل نافذة
 * **آخر ١٠ جلسات حفظ**. كل خطأٍ سطرٌ في ReviewError (تاريخٌ ومَن رصد). بلوغ خطأين داخل
 * النافذة ⟵ يعود المقطع **حفظًا جديدًا** (repairedAt) فيخرج من الراسخ، ويُصفَّر سجلّه.
 * خطأٌ قديمٌ خرج من النافذة (سبقه ١٠ جلسات) لا يُحتسب. تسميعٌ مرن (الحكم ٦).
 */
export async function recordReviewError(
  input: ReviewErrorInput,
  db: PrismaClient = prisma,
): Promise<{ reverted: boolean }> {
  await assertCanRecordListening(input.actorId, input.studentId, db);
  if (!Number.isInteger(input.errorCount) || input.errorCount < 0) {
    throw new ValidationError("عدد أخطاء المراجعة غير صالح.");
  }
  const seg = await db.dailySession.findUnique({
    where: { id: input.sessionId },
    select: { studentId: true, hifzMastered: true, repairedAt: true },
  });
  if (!seg || seg.studentId !== input.studentId || seg.hifzMastered !== true) {
    throw new ValidationError("مقطعٌ محفوظٌ غير موجود.");
  }
  if (seg.repairedAt !== null) return { reverted: false }; // مُرمَّمٌ سلفًا — خارج الراسخ.

  const reviewDate = toDateOnly(input.date);

  const result = await db.$transaction(async (tx) => {
    // ١) سجّل أخطاء هذه المراجعة (سطرٌ لكل خطأ).
    for (let i = 0; i < input.errorCount; i++) {
      await tx.reviewError.create({
        data: { sessionId: input.sessionId, recordedBy: input.actorId, date: reviewDate },
      });
    }

    // ٢) نافذة آخر ١٠ جلسات حفظ (المُتقَنة غير المُرمَّمة) — بدايتها تاريخ العاشرة من الآخر.
    const mastered = await tx.dailySession.findMany({
      where: { studentId: input.studentId, hifzMastered: true, repairedAt: null, hifzFromSurah: { not: null } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    const n = mastered.length;
    const windowStart = mastered[Math.max(0, n - REVIEW_ERROR_WINDOW)].date;

    // ٣) عدّ أخطاء المقطع داخل النافذة (تاريخها ≥ بداية النافذة).
    const countInWindow = await tx.reviewError.count({
      where: { sessionId: input.sessionId, date: { gte: windowStart } },
    });

    if (countInWindow >= 2) {
      // الحكم ٥: خطآن داخل النافذة ⟵ يعود حفظًا جديدًا، ويُصفَّر سجلّ المقطع.
      await tx.dailySession.update({ where: { id: input.sessionId }, data: { repairedAt: new Date() } });
      await tx.reviewError.deleteMany({ where: { sessionId: input.sessionId } });
      await emitEvent(tx, {
        type: "SEGMENT_REVERTED_TO_NEW",
        subjectType: "Student", subjectId: input.studentId, actorId: input.actorId,
        payload: { sessionId: input.sessionId },
      });
      return { reverted: true };
    }

    // خطأٌ واحد داخل النافذة ⟵ تنبيهٌ فقط، يبقى راسخًا.
    await emitEvent(tx, {
      type: "REVIEW_ERROR_LOGGED",
      subjectType: "Student", subjectId: input.studentId, actorId: input.actorId,
      payload: { sessionId: input.sessionId, countInWindow },
    });
    return { reverted: false };
  });

  // العزل الآليّ (الحكم ٨): الترميم هو الحدث الوحيد الذي يُنقص الراسخ ⟵ افحص العرافة فورًا
  // بعد التزام المعاملة (يرى الحالة بعد خروج المقطع من الراسخ)، لا بفحصٍ دوريّ.
  if (result.reverted) {
    await autoDismissArifIfBelowThreshold(input.studentId, db);
  }
  return result;
}

// ═══════════════ عرض الجلسة (للشاشة) ═══════════════

export interface SessionToday {
  hifzFromSurah: number | null;
  hifzFromAyah: number | null;
  hifzToSurah: number | null;
  hifzToAyah: number | null;
  hifzAttempts: number | null;
  hifzMastered: boolean | null;
  tarseekhDone: boolean | null;
  murajaahDone: boolean | null;
  murajaahCount: number | null;
}

export interface HifzGate {
  /** الحكم ١: يجب إعادة مقطع اليوم السابق (لم يُتقن) قبل أيّ جديد. */
  mustRepeat: boolean;
  range: PriorHifz | null;
}

export interface SessionView {
  student: { id: string; name: string };
  program: ProgramKey;
  position: StudentPosition;
  session: SessionToday | null; // جلسة اليوم إن رُصدت
  /** الترسيخ (آخر ١٠) والمراجعة (خُمس الراسخ) — لمراقي فقط (الأحكام ٢، ٤، ٩). */
  consolidation: ConsolidationView | null;
  /** دورة المراجعة الأسبوعية بالمقدار — لمراقي فقط (الحكم ٤ الموسّع). */
  weeklyReview: WeeklyReview | null;
  /** بوابة الحفظ (الحكم ١): إعادةٌ إلزامية قبل الجديد — لمراقي فقط. */
  hifzGate: HifzGate | null;
}

/** الحكم ١ للعرض: هل على الطالب إعادة مقطع أمس (لم يُتقن) قبل جديد؟ */
export async function getHifzGate(
  studentId: string, date: string | Date, db: PrismaClient = prisma,
): Promise<HifzGate> {
  const range = await priorUnmasteredRange(studentId, toDateOnly(date), db);
  return { mustRepeat: range !== null, range };
}

/** يجمع موضع الطالب وجلسة يومه وترسيخه/مراجعته — للمعلم الذي يفتح الجلسة. */
export async function getSessionView(
  actorId: string,
  studentId: string,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<SessionView> {
  await assertTeachesStudent(actorId, studentId, db);
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { user: { select: { nameAsInId: true } } },
  });
  if (!student) throw new ValidationError("طالب غير موجود.");

  const position = await getStudentPosition(studentId, db);
  const d = toDateOnly(date);
  const row = await db.dailySession.findUnique({
    where: { studentId_date: { studentId, date: d } },
    select: {
      hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true,
      hifzAttempts: true, hifzMastered: true, tarseekhDone: true, murajaahDone: true,
      murajaahCount: true,
    },
  });
  const isMaraqi = position.program === ProgramKey.MARAQI;
  const consolidation = isMaraqi ? await getConsolidation(studentId, db) : null;
  const weeklyReview = isMaraqi ? await getWeeklyReview(studentId, date, db) : null;
  const hifzGate = isMaraqi ? await getHifzGate(studentId, date, db) : null;
  return {
    student: { id: studentId, name: student.user.nameAsInId },
    program: position.program,
    position,
    session: row,
    consolidation,
    weeklyReview,
    hifzGate,
  };
}

/** طلاب حلقةٍ (المعلم يختار منهم) — id + اسم. */
export async function listCircleStudents(
  circleId: string,
  db: PrismaClient = prisma,
): Promise<{ id: string; name: string }[]> {
  const rows = await db.enrollment.findMany({
    where: { circleId, endedAt: null },
    select: { student: { select: { id: true, user: { select: { nameAsInId: true } } } } },
  });
  return rows
    .map((r) => ({ id: r.student.id, name: r.student.user.nameAsInId }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
