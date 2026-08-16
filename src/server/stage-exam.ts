import {
  ProgramKey,
  ProgressState,
  StageExamStatus,
  StageKind,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { ApprovalKind } from "@prisma/client";

import { assertCanExamine } from "./examiner-eligibility";
import { gradeHizbHarvest, type HizbRank } from "./hasad-grading";
import { facePagesInRange } from "./mushaf";
import { propose } from "./approval";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";
import type { HasadErrorInput, HasadHesitationInput } from "./hasad";

// ═══════════════ اختبار المرحلة الأصلية (الحكم ٧) ═══════════════
//
// نطاقُه **كامل المحفوظ منذ أول يوم** (كل المراحل الفرعية المكتملة)، بمُختبِرٍ محايد (الحكم ٦).
// عدد الجلسات بعدد الأحزاب، أيامٌ متتالية بالتقويم **شاملةً الجمعة/السبت** (استثناءٌ صريح على
// الحكم ٣). التجميع: **رسوب حزبٍ واحد = رسوب الاختبار كلّه**، والمرتبة النهائية = **أدنى** مرتبة.
// (اعتماد المدير والانتقال — المرحلة التالية.)

// ─────────── دوالُّ نقيّة ───────────

/** عدد جلسات اختبار المرحلة بعدد الأحزاب: ≤٢٠→١، ٢١–٤٠→٢، >٤٠→٣. */
export function sessionsForHizbCount(hizbCount: number): number {
  if (hizbCount <= 20) return 1;
  if (hizbCount <= 40) return 2;
  return 3;
}

/** أيام الجلسات: متتاليةٌ بالتقويم من startISO، **شاملةً العطلة** (لا تخطّي — عكس الحكم ٣). */
export function examSessionDates(startISO: string, sessions: number): string[] {
  const [y, m, d] = startISO.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < sessions; i++) {
    out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
  }
  return out;
}

/** التجميع (الحكم ٧): رسوب حزبٍ = رسوب الكلّ، والمرتبة النهائية = أدنى مرتبة نالها. */
export function aggregateExamRanks(ranks: HizbRank[]): { status: "PASSED" | "FAILED"; finalRank: HizbRank } {
  if (ranks.includes("FAIL")) return { status: "FAILED", finalRank: "FAIL" };
  if (ranks.includes("PASS")) return { status: "PASSED", finalRank: "PASS" };
  return { status: "PASSED", finalRank: "EXCELLENT" }; // كلّها تميّز (أو لا أحزاب)
}

// ─────────── التسجيل ───────────

export interface HizbExamInput {
  stageId: string; // مرحلةٌ فرعية (حزب) مكتملةٌ للطالب
  errors: HasadErrorInput[];
  hesitations?: HasadHesitationInput[];
}

export interface StageExamArgs {
  studentId: string;
  mainStageId: string; // المرحلة الأصلية التي أتمّها
  examinerId: string; // المُختبِر المحايد (ليس معلمه)
  startedOn: string; // YYYY-MM-DD
  hizbs: HizbExamInput[]; // كامل المحفوظ (كل الأحزاب المكتملة)
}

export interface StageExamOutcome {
  examId: string;
  status: "PASSED" | "FAILED";
  finalRank: HizbRank;
  hizbCount: number;
  plannedSessions: number;
  sessionDates: string[];
  approvalId: string | null; // اقتراح انتقالٍ معلَّق عند النجاح (الحكم ٧، المرحلة ٧)
}

/**
 * يسجّل اختبار المرحلة الأصلية: يتحقّق من حياد المُختبِر (الحكم ٦)، ومن أنّ النطاق **كامل**
 * المحفوظ المكتمل (لا حزبٌ ناقص)، يقدّر كل حزبٍ (تردّده يُتحقَّق أنه في أوجه الحزب)، ثم يجمّع
 * (رسوب حزبٍ = رسوب الكلّ، الأدنى مرتبةً) ويُثبِت النتيجة. لا اعتماد ولا انتقال هنا (تاليًا).
 */
export async function recordStageExam(
  args: StageExamArgs,
  db: PrismaClient = prisma,
): Promise<StageExamOutcome> {
  await assertCanExamine({ examinerUserId: args.examinerId, studentId: args.studentId }, db);

  // النطاق: كامل المحفوظ = كل المراحل الفرعية المكتملة للطالب في مراقي.
  const memorized = await db.stageProgress.findMany({
    where: {
      studentId: args.studentId,
      state: ProgressState.COMPLETED,
      stage: { kind: StageKind.SUB_STAGE, program: { key: ProgramKey.MARAQI } },
    },
    select: {
      stageId: true,
      stage: { select: { fromSurah: true, fromAyah: true, toSurah: true, toAyah: true } },
    },
  });
  if (memorized.length === 0) throw new ValidationError("لا محفوظٌ مكتملٌ لاختباره.");

  const memById = new Map(memorized.map((m) => [m.stageId, m.stage]));
  const providedIds = new Set(args.hizbs.map((h) => h.stageId));
  if (providedIds.size !== memorized.length || [...memById.keys()].some((id) => !providedIds.has(id))) {
    throw new ValidationError("النطاق: كامل المحفوظ منذ أول يوم — لا مرحلةٌ وحدها.");
  }

  const ranks: HizbRank[] = [];
  for (const h of args.hizbs) {
    const stage = memById.get(h.stageId);
    if (!stage || stage.fromSurah == null || stage.fromAyah == null || stage.toSurah == null || stage.toAyah == null) {
      throw new ValidationError("حدود حزبٍ ناقصة.");
    }
    const range = { fromSurah: stage.fromSurah, fromAyah: stage.fromAyah, toSurah: stage.toSurah, toAyah: stage.toAyah };
    const hesitations = h.hesitations ?? [];
    if (hesitations.length > 0) {
      const validFaces = await facePagesInRange(range, db);
      for (const hz of hesitations) {
        if (!validFaces.has(hz.faceNo)) {
          throw new ValidationError(`الوجه ${hz.faceNo} خارج حدود الحزب المُختبَر.`);
        }
      }
    }
    const grade = gradeHizbHarvest({
      errors: h.errors.map((e) => ({ faceNo: e.pageNo, surah: e.surah, ayah: e.ayah, errorType: e.errorType })),
      hesitations: hesitations.map((x) => ({ faceNo: x.faceNo })),
    });
    ranks.push(grade.rank);
  }

  const hizbCount = args.hizbs.length;
  const plannedSessions = sessionsForHizbCount(hizbCount);
  const { status, finalRank } = aggregateExamRanks(ranks);

  const examId = await db.$transaction(async (tx) => {
    const e = await tx.stageExam.create({
      data: {
        studentId: args.studentId,
        mainStageId: args.mainStageId,
        examinerId: args.examinerId,
        hizbCount,
        plannedSessions,
        startedOn: new Date(args.startedOn),
        status: status === "FAILED" ? StageExamStatus.FAILED : StageExamStatus.PASSED,
        finalRank,
      },
      select: { id: true },
    });
    await emitEvent(tx, {
      type: "STAGE_EXAM_RECORDED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.examinerId,
      payload: { mainStageId: args.mainStageId, status, finalRank, hizbCount, plannedSessions },
    });
    return e.id;
  });

  // نجاح ⟵ اقتراح انتقالٍ تلقائيّ على المحرّك القائم (الحكم ٧): لا انتقال إلا باعتماد المدير.
  let approvalId: string | null = null;
  if (status === "PASSED") {
    const approval = await propose(
      {
        kind: ApprovalKind.STAGE_TRANSITION,
        subjectType: "StageExam",
        subjectId: examId,
        proposedBy: args.examinerId,
        payload: { studentId: args.studentId, mainStageId: args.mainStageId, finalRank },
      },
      db,
    );
    approvalId = approval.id;
  }

  return {
    examId,
    status,
    finalRank,
    hizbCount,
    plannedSessions,
    sessionDates: examSessionDates(args.startedOn, plannedSessions),
    approvalId,
  };
}
