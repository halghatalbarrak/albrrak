import {
  type ApprovalKind,
  ApprovalStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// محرّك اعتماد واحد يخدم الاستعمالات الثمانية (DESIGN §٣٫٤).
// مُقترَح ← بانتظار الاعتماد ← { معتمَد | مرفوض بسبب }.

export interface ProposeArgs {
  kind: ApprovalKind;
  subjectType: string;
  subjectId: string;
  proposedBy: string;
  payload?: Prisma.InputJsonValue;
}

export async function propose(args: ProposeArgs, db: PrismaClient = prisma) {
  return db.$transaction(async (tx) => {
    const approval = await tx.approval.create({
      data: {
        kind: args.kind,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        proposedBy: args.proposedBy,
        status: ApprovalStatus.PENDING,
        ...(args.payload !== undefined ? { payload: args.payload } : {}),
      },
    });
    await emitEvent(tx, {
      type: "APPROVAL_PROPOSED",
      subjectType: "Approval",
      subjectId: approval.id,
      actorId: args.proposedBy,
      payload: { kind: args.kind },
    });
    return approval;
  });
}

export interface DecideArgs {
  approvalId: string;
  decidedBy: string;
  decision: "APPROVED" | "REJECTED";
  /** إلزامي عند الرفض (DESIGN §٣٫٤: «مرفوض بسبب»). */
  note?: string;
}

export async function decide(args: DecideArgs, db: PrismaClient = prisma) {
  if (args.decision === "REJECTED" && !args.note?.trim()) {
    throw new ValidationError("الرفض يستلزم سببًا مكتوبًا (§٣٫٤).");
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.approval.findUnique({
      where: { id: args.approvalId },
      select: { status: true },
    });
    if (!existing) {
      throw new ValidationError("الاعتماد غير موجود.");
    }
    if (existing.status !== ApprovalStatus.PENDING) {
      throw new ValidationError("الاعتماد حُسم من قبل — لا يُحسم مرتين.");
    }

    const approval = await tx.approval.update({
      where: { id: args.approvalId },
      data: {
        status:
          args.decision === "APPROVED"
            ? ApprovalStatus.APPROVED
            : ApprovalStatus.REJECTED,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.note?.trim() ?? null,
      },
    });
    await emitEvent(tx, {
      type: "APPROVAL_DECIDED",
      subjectType: "Approval",
      subjectId: approval.id,
      actorId: args.decidedBy,
      payload: { decision: args.decision },
    });
    return approval;
  });
}
