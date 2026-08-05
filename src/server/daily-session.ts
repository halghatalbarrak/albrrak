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
            stageId: cur.id, label: cur.nameAr, hizb: cur.hizbNumber,
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

/** الحفظ — المعلم وحده (§٨٫٣): النطاق + عدد المحاولات + أتقن. لمراقي فقط. */
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
  if (!Number.isInteger(input.attempts) || input.attempts < 1) {
    throw new ValidationError("عدد المحاولات لا يقلّ عن ١.");
  }
  const date = toDateOnly(input.date);
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
 * منطق التسميع (الحكم ٦): **مرن** — لا يشترط الحياد. المعلّم يسجّله ويتحمّل مسؤوليته،
 * وله أن يُسنِد من سمّع فعلاً لأيّ شخص (بما فيهم العريف). يختلف عن **الاختبار**
 * (assertCanExamine) الذي يشترط الحياد (المُختبِر ليس معلمه — للترقية/المحطة/الحصاد).
 * فالمعلّم يُسمِّع طالبه (مسموح) ولا يختبره (ممنوع).
 */
export async function assertCanRecordListening(
  actorId: string,
  studentId: string,
  db: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<StudentCircle> {
  return assertTeachesStudent(actorId, studentId, db);
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

/** المراجعة — «تمّ/لم يتم فقط» (§٨٫٣). تسميعٌ مرن: المعلّم يُسمِّع أو يُسنِد (الحكم ٦). */
export async function recordMurajaah(input: ConsolidationInput, db: PrismaClient = prisma): Promise<void> {
  const sc = await assertCanRecordListening(input.actorId, input.studentId, db);
  const listener = input.listenerId ?? input.actorId;
  const date = toDateOnly(input.date);
  await db.$transaction(async (tx) => {
    await upsertSession(tx, input.studentId, sc.circleId, date, {
      studentId: input.studentId, circleId: sc.circleId, date,
      murajaahDone: input.done, murajaahListenerId: listener,
    });
    await emitEvent(tx, {
      type: "MURAJAAH_RECORDED", subjectType: "Student", subjectId: input.studentId,
      actorId: input.actorId,
      payload: { done: input.done, listenerId: listener, delegated: listener !== input.actorId },
    });
  });
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
}

export interface SessionView {
  student: { id: string; name: string };
  program: ProgramKey;
  position: StudentPosition;
  session: SessionToday | null; // جلسة اليوم إن رُصدت
}

/** يجمع موضع الطالب وجلسة يومه — للمعلم الذي يفتح الجلسة. */
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
    },
  });
  return {
    student: { id: studentId, name: student.user.nameAsInId },
    program: position.program,
    position,
    session: row,
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
