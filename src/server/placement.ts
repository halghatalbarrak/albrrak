import {
  ApprovalKind,
  ApprovalStatus,
  type Prisma,
  type PrismaClient,
  ProgramKey,
  StudentState,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// §٦٫٣ اختبار القراءة (التحديد): المُسجِّل يقرر ← المدير يعتمد قبل النفاذ ← الإسناد.
// المخرج (§٥): لا يجيد نظراً ← القاعدة المدنية (IN_QAIDAH + حلقة). يجيد نظراً ← بانتظار
// اختبار المقطع (AWAITING_PACE_TEST، بلا حلقة — المقطع لاحقًا). سجلّ الاختبار = الاعتماد نفسه.

export interface ReadingTestInput {
  studentId: string;
  examinerId: string;
  /** ملاحظات المختبر النصية (§٦٫٣). */
  notes: string;
  /** يجيد القراءة نظراً من المصحف؟ */
  readsFluently: boolean;
  /** حلقة القاعدة المدنية — إلزامية إن لم يجد نظراً. */
  circleId?: string | null;
}

interface PlacementPayload {
  readsFluently: boolean;
  notes: string;
  circleId: string | null;
}

/** المُسجِّل يقترح قرار التحديد ← اعتماد PLACEMENT_DECISION معلّق. */
export async function proposeReadingTest(
  input: ReadingTestInput,
  db: PrismaClient = prisma,
) {
  const notes = input.notes?.trim();
  if (!notes) throw new ValidationError("ملاحظات المختبر مطلوبة (§٦٫٣).");

  return db.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { state: true },
    });
    if (!student) throw new ValidationError("طالب غير موجود.");
    if (student.state !== StudentState.AWAITING_READING_TEST) {
      throw new ValidationError("اختبار القراءة لا يُسجَّل إلا لطالبٍ بانتظاره.");
    }
    const already = await tx.approval.findFirst({
      where: {
        kind: ApprovalKind.PLACEMENT_DECISION,
        subjectId: input.studentId,
        status: ApprovalStatus.PENDING,
      },
      select: { id: true },
    });
    if (already) throw new ValidationError("لهذا الطالب قرار تحديدٍ معلّقٌ بالفعل.");

    let circleId: string | null = null;
    if (!input.readsFluently) {
      // لا يجيد نظراً ← القاعدة المدنية ← حلقةٌ إلزامية من برنامج القاعدة.
      if (!input.circleId) throw new ValidationError("مسار القاعدة المدنية يحتاج حلقةً.");
      const circle = await tx.circle.findUnique({
        where: { id: input.circleId },
        select: { program: { select: { key: true } } },
      });
      if (!circle) throw new ValidationError("الحلقة غير موجودة.");
      if (circle.program.key !== ProgramKey.QAIDAH_MADANIYYAH) {
        throw new ValidationError("حلقة القاعدة المدنية فقط لمن لا يجيد النظر.");
      }
      circleId = input.circleId;
    }
    // يجيد نظراً ← لا حلقة الآن (اختبار المقطع يليه).

    const payload: PlacementPayload = { readsFluently: input.readsFluently, notes, circleId };
    const approval = await tx.approval.create({
      data: {
        kind: ApprovalKind.PLACEMENT_DECISION,
        subjectType: "Student",
        subjectId: input.studentId,
        proposedBy: input.examinerId,
        status: ApprovalStatus.PENDING,
        payload: payload as unknown as Prisma.InputJsonObject,
      },
    });
    await emitEvent(tx, {
      type: "READING_TEST_PROPOSED",
      subjectType: "Student",
      subjectId: input.studentId,
      actorId: input.examinerId,
      payload: { readsFluently: input.readsFluently },
    });
    return approval;
  });
}

export interface PlacementResult {
  applied: boolean;
  outcome?: "QAIDAH" | "MARAQI_BOUND";
}

/**
 * المدير يعتمد ← الأثر ينفذ (الإسناد + انتقال الحالة). أو يرفض بسبب ← يبقى بانتظار القراءة.
 * الاعتماد وتطبيقه في معاملةٍ واحدة (لا اعتمادٌ بلا أثر، ولا أثرٌ بلا اعتماد).
 */
export async function decideReadingTest(
  args: {
    approvalId: string;
    decidedBy: string;
    decision: "APPROVED" | "REJECTED";
    note?: string;
  },
  db: PrismaClient = prisma,
): Promise<PlacementResult> {
  if (args.decision === "REJECTED" && !args.note?.trim()) {
    throw new ValidationError("الرفض يستلزم سببًا مكتوبًا (§٣٫٤).");
  }
  return db.$transaction(async (tx) => {
    const approval = await tx.approval.findUnique({
      where: { id: args.approvalId },
      select: { kind: true, status: true, subjectId: true, payload: true },
    });
    if (!approval || approval.kind !== ApprovalKind.PLACEMENT_DECISION) {
      throw new ValidationError("قرار تحديدٍ غير موجود.");
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ValidationError("القرار حُسم من قبل — لا يُحسم مرتين.");
    }

    const updated = await tx.approval.update({
      where: { id: args.approvalId },
      data: {
        status:
          args.decision === "APPROVED" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.note?.trim() ?? null,
      },
    });
    await emitEvent(tx, {
      type: "APPROVAL_DECIDED",
      subjectType: "Approval",
      subjectId: updated.id,
      actorId: args.decidedBy,
      payload: { decision: args.decision, kind: "PLACEMENT_DECISION" },
    });

    if (args.decision === "REJECTED") {
      // يبقى بانتظار اختبار القراءة — يُعاد تسجيله.
      return { applied: false };
    }

    // APPROVED ← نفّذ الإسناد وانتقال الحالة.
    const student = await tx.student.findUniqueOrThrow({
      where: { id: approval.subjectId },
      select: { state: true },
    });
    if (student.state !== StudentState.AWAITING_READING_TEST) {
      throw new ValidationError("حالة الطالب تغيّرت — تعذّر تنفيذ التحديد.");
    }
    const p = approval.payload as unknown as PlacementPayload;
    if (typeof p?.readsFluently !== "boolean") {
      throw new ValidationError("بيان القرار تالفٌ — تعذّر التنفيذ.");
    }

    if (p.readsFluently) {
      await tx.student.update({
        where: { id: approval.subjectId },
        data: { state: StudentState.AWAITING_PACE_TEST },
      });
      await emitEvent(tx, {
        type: "PLACED_AWAITING_PACE_TEST",
        subjectType: "Student",
        subjectId: approval.subjectId,
        actorId: args.decidedBy,
      });
      return { applied: true, outcome: "MARAQI_BOUND" };
    }

    // لا يجيد نظراً ← قاعدة مدنية ← حلقة + IN_QAIDAH.
    if (!p.circleId) throw new ValidationError("قرار القاعدة المدنية بلا حلقة — تعذّر الإسناد.");
    await tx.enrollment.create({
      data: { studentId: approval.subjectId, circleId: p.circleId },
    });
    await tx.student.update({
      where: { id: approval.subjectId },
      data: { state: StudentState.IN_QAIDAH },
    });
    await emitEvent(tx, {
      type: "ENROLLED_IN_QAIDAH",
      subjectType: "Student",
      subjectId: approval.subjectId,
      actorId: args.decidedBy,
      payload: { circleId: p.circleId },
    });
    return { applied: true, outcome: "QAIDAH" };
  });
}
