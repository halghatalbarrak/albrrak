import {
  HasadResult,
  ProgramKey,
  ProgressState,
  StageKind,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { assertCanExamine, canExamine } from "./examiner-eligibility";
import { assertTeachesStudent } from "./daily-session";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// ═══════════════ الحصاد (م٤ج — DESIGN §٨٫٧–٨٫٩) ═══════════════
//
// النطاق (بقرار): الأساس + الخوارزمية. المعلم يُعلن الجاهزية؛ والمُسمِّع (ليس معلمه —
// قاعدة مطلقة م١) يسجّل الحصاد وأخطاءه؛ والخادم يحسب الحدّ (رسوب/نجاح).
//
// خوارزمية الحدّ (§٨٫٧): لكل صفحةٍ في المسرود — خطآن فأكثر ← راسب (توقّف). صفحةٌ نظيفة
// لا تشفع لما بعدها (الأخطاء لا تُرحَّل). «متميّز» (كل حزب ≤ خطأ) مؤجَّلٌ حتى يوقّع محمد
// جدول صفحة←حزب (لا يُشتقّ بـ«÷١٠»). مؤجَّلٌ أيضًا: محرّك إسناد المُسمِّع، والترميم/العودة
// للصفر وأثر الرسوب، ووقف الحفظ، ولوحة اعتماد المدير (§٨٫٨–٨٫١١).

function pointLE(s1: number, a1: number, s2: number, a2: number): boolean {
  return s1 < s2 || (s1 === s2 && a1 <= a2);
}

// ═══════════════ خوارزمية الحدّ — دالّة نقيّة ═══════════════

export interface HasadErrorInput {
  pageNo: number;
  errorType: "WORD" | "LETTER" | "FORGOTTEN_AYAH";
  surah?: number;
  ayah?: number;
}

export interface HasadGrade {
  /** رسوب/نجاح فقط الآن؛ «متميّز» مؤجَّل. */
  result: "PASS" | "FAIL";
  /** الصفحات الراسبة (خطآن فأكثر) — تُعرض للطالب (§٨٫٨). */
  failedPages: number[];
}

/**
 * الحدّ لكل صفحةٍ على حدة (§٨٫٧): أي صفحةٍ فيها خطآن فأكثر ← راسب. الصفحة النظيفة
 * لا تشفع لغيرها. دالّة نقيّة قابلة للاختبار.
 */
export function gradeHasad(errors: HasadErrorInput[]): HasadGrade {
  const perPage = new Map<number, number>();
  for (const e of errors) perPage.set(e.pageNo, (perPage.get(e.pageNo) ?? 0) + 1);
  const failedPages = [...perPage.entries()]
    .filter(([, count]) => count >= 2)
    .map(([page]) => page)
    .sort((a, b) => a - b);
  return { result: failedPages.length > 0 ? "FAIL" : "PASS", failedPages };
}

// ═══════════════ نطاق حصاد المرحلة الفرعية (§٨٫٧) ═══════════════

async function requireMaraqiSubStage(db: PrismaClient, stageId: string) {
  const stage = await db.stage.findUnique({
    where: { id: stageId },
    select: {
      id: true, kind: true, parentId: true, hizbNumber: true,
      fromSurah: true, fromAyah: true, toSurah: true, toAyah: true,
      program: { select: { key: true } },
    },
  });
  if (!stage) throw new ValidationError("مرحلة غير موجودة.");
  if (stage.kind !== StageKind.SUB_STAGE || stage.program.key !== ProgramKey.MARAQI) {
    throw new ValidationError("الحصاد لمرحلةٍ فرعية في مراقي.");
  }
  if (stage.fromSurah == null || stage.fromAyah == null || stage.toSurah == null || stage.toAyah == null) {
    throw new ValidationError("حدود المرحلة الفرعية ناقصة.");
  }
  return stage;
}

export interface HarvestRange {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

/**
 * نطاق حصاد المرحلة الفرعية (§٨٫٧): **من أول المرحلة الأصلية الحالية إلى هذا الحزب** —
 * لا من أول البرنامج. عمليًّا (مراقي تنازليّ): من بداية الحزب الحاليّ إلى أعلى موضعٍ في
 * مرحلته الأصلية (أول ما حُفظ فيها). فلا يمتدّ المسرود إلى مراحل أصلية سابقة.
 */
export async function subStageHarvestRange(
  stageId: string,
  db: PrismaClient = prisma,
): Promise<HarvestRange> {
  const sub = await requireMaraqiSubStage(db, stageId);
  if (!sub.parentId) throw new ValidationError("المرحلة الفرعية بلا مرحلةٍ أصلية.");

  const siblings = await db.stage.findMany({
    where: { parentId: sub.parentId, kind: StageKind.SUB_STAGE },
    select: { toSurah: true, toAyah: true },
  });
  // أعلى موضعٍ في المرحلة الأصلية (نهاية أول ما حُفظ فيها).
  let endS = sub.toSurah as number, endA = sub.toAyah as number;
  for (const s of siblings) {
    if (s.toSurah != null && s.toAyah != null && pointLE(endS, endA, s.toSurah, s.toAyah)) {
      endS = s.toSurah; endA = s.toAyah;
    }
  }
  return {
    fromSurah: sub.fromSurah as number,
    fromAyah: sub.fromAyah as number,
    toSurah: endS,
    toAyah: endA,
  };
}

// ═══════════════ إعلان الجاهزية (المعلم) ═══════════════

/**
 * المعلم يعلن جاهزية طالبه لحصاد مرحلته الفرعية (§٨٫٩). يُسجَّل على StageProgress
 * (readyDeclaredAt + AWAITING_HASAD). لا يعلنها إلا معلمه (يُتحقَّق في الخادم).
 */
export async function declareHasadReadiness(
  args: { studentId: string; stageId: string; teacherId: string },
  db: PrismaClient = prisma,
): Promise<void> {
  await assertTeachesStudent(args.teacherId, args.studentId, db);
  await requireMaraqiSubStage(db, args.stageId);
  await db.$transaction(async (tx) => {
    await tx.stageProgress.upsert({
      where: { studentId_stageId: { studentId: args.studentId, stageId: args.stageId } },
      update: { state: ProgressState.AWAITING_HASAD, readyDeclaredAt: new Date() },
      create: {
        student: { connect: { id: args.studentId } },
        stage: { connect: { id: args.stageId } },
        state: ProgressState.AWAITING_HASAD,
        startedAt: new Date(),
        readyDeclaredAt: new Date(),
      },
    });
    await emitEvent(tx, {
      type: "HASAD_READINESS_DECLARED",
      subjectType: "Stage",
      subjectId: args.stageId,
      actorId: args.teacherId,
      payload: { studentId: args.studentId },
    });
  });
}

// ═══════════════ تسجيل الحصاد (المُسمِّع — ليس معلمه) ═══════════════

export interface RecordHasadArgs {
  studentId: string;
  stageId: string;
  reciterId: string; // المُسمِّع — ليس معلمه (م١، يُتحقَّق في الخادم)
  errors: HasadErrorInput[];
}

export interface HasadOutcome {
  hasadId: string;
  result: "PASS" | "FAIL";
  failedPages: number[];
  attemptNo: number;
}

/**
 * المُسمِّع يسجّل الحصاد وأخطاءه، فيُحسب الحدّ (رسوب/نجاح). **قاعدة مطلقة:** المُسمِّع
 * ليس معلم الطالب (م١). ويشترط أن تكون الجاهزية أُعلنت (AWAITING_HASAD). أثر النتيجة
 * (الترميم/العودة للصفر/الاعتماد) مؤجَّلٌ لدفعةٍ تالية — هنا يُسجَّل الحصاد ونتيجته فقط.
 */
export async function recordHasad(
  args: RecordHasadArgs,
  db: PrismaClient = prisma,
): Promise<HasadOutcome> {
  // القاعدة المطلقة أولًا.
  await assertCanExamine({ examinerUserId: args.reciterId, studentId: args.studentId }, db);

  await requireMaraqiSubStage(db, args.stageId);
  const progress = await db.stageProgress.findUnique({
    where: { studentId_stageId: { studentId: args.studentId, stageId: args.stageId } },
    select: { state: true },
  });
  if (progress?.state !== ProgressState.AWAITING_HASAD) {
    throw new ValidationError("لم تُعلَن جاهزية هذا الطالب لهذا الحصاد.");
  }
  if (!Array.isArray(args.errors)) throw new ValidationError("قائمة الأخطاء مطلوبة.");
  for (const e of args.errors) {
    if (!Number.isInteger(e.pageNo) || e.pageNo < 1) throw new ValidationError("رقم صفحةٍ غير صالح.");
    if (!["WORD", "LETTER", "FORGOTTEN_AYAH"].includes(e.errorType)) {
      throw new ValidationError("نوع خطأٍ غير معروف.");
    }
  }

  const range = await subStageHarvestRange(args.stageId, db);
  const grade = gradeHasad(args.errors);
  const priorCount = await db.hasad.count({
    where: { studentId: args.studentId, stageId: args.stageId },
  });
  const attemptNo = priorCount + 1;

  const hasadId = await db.$transaction(async (tx) => {
    const hasad = await tx.hasad.create({
      data: {
        studentId: args.studentId,
        stageId: args.stageId,
        reciterId: args.reciterId,
        conductedAt: new Date(),
        fromSurah: range.fromSurah, fromAyah: range.fromAyah,
        toSurah: range.toSurah, toAyah: range.toAyah,
        result: grade.result === "FAIL" ? HasadResult.FAIL : HasadResult.PASS,
        attemptNo,
        pageErrors: {
          create: args.errors.map((e) => ({
            pageNo: e.pageNo,
            errorType: e.errorType,
            ...(e.surah !== undefined ? { surah: e.surah } : {}),
            ...(e.ayah !== undefined ? { ayah: e.ayah } : {}),
          })),
        },
      },
      select: { id: true },
    });
    await emitEvent(tx, {
      type: "HASAD_RECORDED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.reciterId,
      payload: { stageId: args.stageId, result: grade.result, attemptNo },
    });
    return hasad.id;
  });

  return { hasadId, result: grade.result, failedPages: grade.failedPages, attemptNo };
}

// ═══════════════ القائمة للمُسمِّع ═══════════════

export interface ReadyStudent {
  studentId: string;
  name: string;
  stageId: string;
  stageLabel: string;
  hizb: number | null;
}

/**
 * الطلاب الذين أُعلنت جاهزيتهم للحصاد، ممّن **يجوز لهذا المُسمِّع** حصادهم (ليس معلمهم).
 * فارغٌ بأمان. (محرّك الإسناد الكامل بقيوده الخمسة مؤجَّل — هنا ترشيحٌ بالقاعدة المطلقة.)
 */
export async function listReadyForHasad(
  reciterId: string,
  db: PrismaClient = prisma,
): Promise<ReadyStudent[]> {
  const rows = await db.stageProgress.findMany({
    where: {
      state: ProgressState.AWAITING_HASAD,
      readyDeclaredAt: { not: null },
      stage: { kind: StageKind.SUB_STAGE, program: { key: ProgramKey.MARAQI } },
    },
    select: {
      studentId: true,
      stage: { select: { id: true, nameAr: true, hizbNumber: true } },
      student: { select: { user: { select: { nameAsInId: true } } } },
    },
  });
  const out: ReadyStudent[] = [];
  for (const r of rows) {
    if (await canExamine({ examinerUserId: reciterId, studentId: r.studentId }, db)) {
      out.push({
        studentId: r.studentId,
        name: r.student.user.nameAsInId,
        stageId: r.stage.id,
        stageLabel: r.stage.nameAr,
        hizb: r.stage.hizbNumber,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
