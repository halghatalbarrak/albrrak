import { randomUUID } from "node:crypto";

import {
  ApprovalKind,
  ApprovalStatus,
  CertificateTemplate,
  ProgressState,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// ═══════════════ اعتماد المدير + الانتقال (الحكم ٧، المرحلة ٧) ═══════════════
//
// نجاح اختبار المرحلة (StageExam) يقترح STAGE_TRANSITION على محرّك الاعتمادات القائم.
// **لا انتقال إلى المرحلة الأصلية التالية إلا باعتماد المدير.** والراسب: المدير يقرّر
// الإعادة ونطاقها ومهلتها — لا قاعدة آلية، ويُسجَّل القرار ومن اتّخذه.

interface StageTransitionPayload {
  studentId: string;
  mainStageId: string;
  finalRank?: string;
}

export interface DecideStageTransitionArgs {
  approvalId: string;
  decidedBy: string; // المدير (يُتحقَّق دوره في المسار)
  decision: "APPROVED" | "REJECTED";
  note?: string; // إلزاميّ عند الرفض
}

export interface StageTransitionResult {
  approvalId: string;
  status: "APPROVED" | "REJECTED";
  transitioned: boolean;
  mainStageId: string | null;
}

/**
 * المدير يحسم اقتراح انتقال المرحلة الأصلية. الاعتماد ← يُتمّ المرحلة الأصلية (COMPLETED)
 * فينتقل؛ الرفض ← لا انتقال. كلّه في معاملةٍ واحدة (كنمط decideReadingTest).
 */
export async function decideStageTransition(
  args: DecideStageTransitionArgs,
  db: PrismaClient = prisma,
): Promise<StageTransitionResult> {
  if (args.decision === "REJECTED" && !args.note?.trim()) {
    throw new ValidationError("الرفض يستلزم سببًا مكتوبًا (§٣٫٤).");
  }
  return db.$transaction(async (tx) => {
    const approval = await tx.approval.findUnique({
      where: { id: args.approvalId },
      select: { kind: true, status: true, payload: true },
    });
    if (!approval || approval.kind !== ApprovalKind.STAGE_TRANSITION) {
      throw new ValidationError("اقتراح انتقالٍ غير موجود.");
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ValidationError("الاقتراح حُسم من قبل — لا يُحسم مرتين.");
    }
    const payload = (approval.payload ?? {}) as unknown as StageTransitionPayload;

    await tx.approval.update({
      where: { id: args.approvalId },
      data: {
        status: args.decision === "APPROVED" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.note?.trim() ?? null,
      },
    });
    await emitEvent(tx, {
      type: "APPROVAL_DECIDED",
      subjectType: "Approval",
      subjectId: args.approvalId,
      actorId: args.decidedBy,
      payload: { decision: args.decision, kind: "STAGE_TRANSITION" },
    });

    let transitioned = false;
    if (args.decision === "APPROVED" && payload.studentId && payload.mainStageId) {
      // الانتقال: إتمام المرحلة الأصلية (COMPLETED) — لا يقع إلا بهذا الاعتماد.
      await tx.stageProgress.upsert({
        where: { studentId_stageId: { studentId: payload.studentId, stageId: payload.mainStageId } },
        update: { state: ProgressState.COMPLETED, completedAt: new Date() },
        create: {
          student: { connect: { id: payload.studentId } },
          stage: { connect: { id: payload.mainStageId } },
          state: ProgressState.COMPLETED,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      // شهادة إتمام المرحلة الأصلية (م٥) — تُصدَر باعتماد المدير (الحكم ٧). مرّةً لكل مرحلة.
      const already = await tx.certificate.findFirst({ where: { studentId: payload.studentId, template: CertificateTemplate.MAIN_STAGE, stageId: payload.mainStageId }, select: { id: true } });
      if (!already) {
        await tx.certificate.create({
          data: { studentId: payload.studentId, template: CertificateTemplate.MAIN_STAGE, verifyToken: randomUUID(), stageId: payload.mainStageId, isExcellent: payload.finalRank === "EXCELLENT" },
        });
      }
      await emitEvent(tx, {
        type: "MAIN_STAGE_TRANSITION",
        subjectType: "Student",
        subjectId: payload.studentId,
        actorId: args.decidedBy,
        payload: { mainStageId: payload.mainStageId, automatic: false },
      });
      transitioned = true;
    }

    return {
      approvalId: args.approvalId,
      status: args.decision,
      transitioned,
      mainStageId: payload.mainStageId ?? null,
    };
  });
}

export interface DecideRetakeArgs {
  examId: string;
  decidedBy: string; // المدير
  scopeNote: string; // نطاق الإعادة (نصّ الإدارة)
  deadline?: string; // مهلةٌ اختياريّة (YYYY-MM-DD)
  note?: string;
}

/**
 * الراسب: المدير يقرّر الإعادة ونطاقها ومهلتها (لا قاعدة آلية). يُسجَّل القرار ومن اتّخذه
 * حدثًا (RETAKE_DECIDED). يُشترط أن يكون الاختبار راسبًا فعلًا.
 */
export async function decideRetake(
  args: DecideRetakeArgs,
  db: PrismaClient = prisma,
): Promise<{ examId: string }> {
  if (!args.scopeNote?.trim()) throw new ValidationError("نطاق الإعادة مطلوب.");
  const exam = await db.stageExam.findUnique({
    where: { id: args.examId },
    select: { studentId: true, status: true },
  });
  if (!exam) throw new ValidationError("اختبار المرحلة غير موجود.");
  if (exam.status !== "FAILED") throw new ValidationError("قرار الإعادة لاختبارٍ راسبٍ فقط.");

  await emitEvent(db, {
    type: "RETAKE_DECIDED",
    subjectType: "StageExam",
    subjectId: args.examId,
    actorId: args.decidedBy,
    payload: {
      studentId: exam.studentId,
      scopeNote: args.scopeNote.trim(),
      ...(args.deadline ? { deadline: args.deadline } : {}),
      ...(args.note?.trim() ? { note: args.note.trim() } : {}),
    },
  });
  return { examId: args.examId };
}

export interface PendingStageTransition {
  approvalId: string;
  studentId: string;
  studentName: string;
  mainStageId: string;
  mainStageLabel: string;
  finalRank: string | null;
  proposedAt: string;
}

/** اقتراحات انتقال المرحلة المعلَّقة — للوحة اعتماد المدير. */
export async function listPendingStageTransitions(
  db: PrismaClient = prisma,
): Promise<PendingStageTransition[]> {
  const rows = await db.approval.findMany({
    where: { kind: ApprovalKind.STAGE_TRANSITION, status: ApprovalStatus.PENDING },
    select: { id: true, payload: true, proposedAt: true },
    orderBy: { proposedAt: "asc" },
  });
  const out: PendingStageTransition[] = [];
  for (const r of rows) {
    const p = (r.payload ?? {}) as unknown as StageTransitionPayload;
    if (!p.studentId || !p.mainStageId) continue;
    const student = await db.student.findUnique({
      where: { id: p.studentId },
      select: { user: { select: { nameAsInId: true } } },
    });
    const stage = await db.stage.findUnique({ where: { id: p.mainStageId }, select: { nameAr: true } });
    out.push({
      approvalId: r.id,
      studentId: p.studentId,
      studentName: student?.user.nameAsInId ?? "—",
      mainStageId: p.mainStageId,
      mainStageLabel: stage?.nameAr ?? "—",
      finalRank: p.finalRank ?? null,
      proposedAt: r.proposedAt.toISOString(),
    });
  }
  return out;
}
