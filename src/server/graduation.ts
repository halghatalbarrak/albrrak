import { randomUUID } from "node:crypto";

import {
  ApprovalKind,
  ApprovalStatus,
  CertificateTemplate,
  StageExamStatus,
  StudentState,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { propose } from "./approval";
import { recordStageExam, type StageExamArgs, type StageExamOutcome } from "./stage-exam";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// ═══════════════ التخرّج (الحكم ٧، المرحلة ٨) ═══════════════
//
// المرحلة السادسة (الأخيرة): **ثلاث جولاتٍ ناجحة**، بينها **شهرٌ ميلاديٌّ واحد** (من نهاية
// الجولة إلى بداية التالية). اكتمال الثالثة ⟵ اقتراح GRADUATION. اعتماد المدير ⟵ الحالة
// GRADUATED ثمّ إصدار شهادة KHATM (بهذا الترتيب: الشهادة بعد تغيّر الحالة لا قبله).

/** الجولات الثلاث مُلزِمة — لا تخرّج بجولتين. */
export const REQUIRED_GRADUATION_ROUNDS = 3;

/** نهاية الجولة = بدايتها + (عدد جلساتها − ١) يومًا بالتقويم. */
export function roundEndDate(startedOnISO: string, plannedSessions: number): string {
  const [y, m, d] = startedOnISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + plannedSessions - 1)).toISOString().slice(0, 10);
}

/** التاريخ + شهرٌ ميلاديٌّ واحد (بنفس اليوم؛ يدحرج JS عند تجاوز طول الشهر). */
export function addOneCalendarMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); // m (0-based) = الشهر التالي
}

/** المهلة: بداية الجولة التالية ≥ نهاية السابقة + شهرٍ ميلاديّ. (مقارنة ISO نصّيّة = زمنيّة.) */
export function spacingSatisfied(prevEndISO: string, nextStartISO: string): boolean {
  return nextStartISO >= addOneCalendarMonth(prevEndISO);
}

/**
 * هل تكفي جولاتُ الطالب للتخرّج؟ ثلاثٌ ناجحةٌ فأكثر، وآخر ثلاثٍ منها بينها مهلةُ شهرٍ صحيحة.
 */
export function roundsSatisfyGraduation(
  rounds: { startedOn: string; plannedSessions: number }[],
): boolean {
  if (rounds.length < REQUIRED_GRADUATION_ROUNDS) return false;
  const sorted = [...rounds].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  const last3 = sorted.slice(-REQUIRED_GRADUATION_ROUNDS);
  for (let i = 1; i < last3.length; i++) {
    const prevEnd = roundEndDate(last3[i - 1].startedOn, last3[i - 1].plannedSessions);
    if (!spacingSatisfied(prevEnd, last3[i].startedOn)) return false;
  }
  return true;
}

export interface GraduationRoundResult {
  exam: StageExamOutcome;
  graduationProposalId: string | null; // يُقترَح عند اكتمال الثالثة بمهلةٍ صحيحة
}

/**
 * جولةُ اختبارِ المرحلة السادسة (لا تقترح STAGE_TRANSITION). بعد تسجيلها، إن بلغت جولاتُ
 * الطالب الناجحة الثلاثَ بمهلةٍ صحيحة ⟵ يُقترَح GRADUATION على المحرّك القائم.
 */
export async function recordGraduationRound(
  args: Omit<StageExamArgs, "autoPropose">,
  db: PrismaClient = prisma,
): Promise<GraduationRoundResult> {
  const exam = await recordStageExam({ ...args, autoPropose: false }, db);

  const passed = await db.stageExam.findMany({
    where: { studentId: args.studentId, mainStageId: args.mainStageId, status: StageExamStatus.PASSED },
    select: { startedOn: true, plannedSessions: true },
    orderBy: { startedOn: "asc" },
  });
  const rounds = passed.map((r) => ({
    startedOn: r.startedOn.toISOString().slice(0, 10),
    plannedSessions: r.plannedSessions,
  }));

  let graduationProposalId: string | null = null;
  if (roundsSatisfyGraduation(rounds)) {
    const approval = await propose(
      {
        kind: ApprovalKind.GRADUATION,
        subjectType: "Student",
        subjectId: args.studentId,
        proposedBy: args.examinerId,
        payload: { studentId: args.studentId, mainStageId: args.mainStageId },
      },
      db,
    );
    graduationProposalId = approval.id;
  }
  return { exam, graduationProposalId };
}

interface GraduationPayload {
  studentId: string;
  mainStageId?: string;
}

export interface DecideGraduationArgs {
  approvalId: string;
  decidedBy: string; // المدير
  decision: "APPROVED" | "REJECTED";
  note?: string;
}

export interface GraduationResult {
  approvalId: string;
  status: "APPROVED" | "REJECTED";
  graduated: boolean;
  certificateId: string | null;
}

/**
 * المدير يحسم اقتراح التخرّج. الاعتماد ⟵ **الحالة GRADUATED أولًا، ثمّ** شهادة KHATM (بهذا
 * الترتيب). الرفض ⟵ لا تخرّج ولا شهادة. كلّه في معاملةٍ واحدة.
 */
export async function decideGraduation(
  args: DecideGraduationArgs,
  db: PrismaClient = prisma,
): Promise<GraduationResult> {
  if (args.decision === "REJECTED" && !args.note?.trim()) {
    throw new ValidationError("الرفض يستلزم سببًا مكتوبًا (§٣٫٤).");
  }
  return db.$transaction(async (tx) => {
    const approval = await tx.approval.findUnique({
      where: { id: args.approvalId },
      select: { kind: true, status: true, payload: true },
    });
    if (!approval || approval.kind !== ApprovalKind.GRADUATION) {
      throw new ValidationError("اقتراح تخرّجٍ غير موجود.");
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ValidationError("الاقتراح حُسم من قبل — لا يُحسم مرتين.");
    }
    const payload = (approval.payload ?? {}) as unknown as GraduationPayload;

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
      payload: { decision: args.decision, kind: "GRADUATION" },
    });

    let graduated = false;
    let certificateId: string | null = null;
    if (args.decision === "APPROVED" && payload.studentId) {
      // الترتيب المُلزِم: الحالة أولًا…
      await tx.student.update({
        where: { id: payload.studentId },
        data: { state: StudentState.GRADUATED },
      });
      // …ثمّ الشهادة (بعد تغيّر الحالة لا قبله).
      const cert = await tx.certificate.create({
        data: {
          studentId: payload.studentId,
          template: CertificateTemplate.KHATM,
          verifyToken: randomUUID(),
          ...(payload.mainStageId ? { stageId: payload.mainStageId } : {}),
        },
        select: { id: true },
      });
      certificateId = cert.id;
      await emitEvent(tx, {
        type: "STUDENT_GRADUATED",
        subjectType: "Student",
        subjectId: payload.studentId,
        actorId: args.decidedBy,
        payload: { certificateId },
      });
      graduated = true;
    }

    return { approvalId: args.approvalId, status: args.decision, graduated, certificateId };
  });
}
