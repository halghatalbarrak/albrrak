import { randomUUID } from "node:crypto";

import {
  ApprovalKind,
  CertificateTemplate,
  ProgramKey,
  ProgressState,
  Role,
  StageKind,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { decide, propose } from "./approval";
import { assertCanExamine } from "./examiner-eligibility";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";
import { getMilestoneFailureAction } from "./settings";

/**
 * القاعدة المدنية (م٣) — البنية فقط (لا بذر).
 *
 * مستويان (DESIGN §٧٫٤):
 *   الباب  = تتبّعٌ **بلا بوابة**: startedAt / completedAt / attendanceDays + وزن.
 *   المحطة = **اختبار + اعتماد**: المُختبِر يقترح النتيجة (وهو ليس معلمه م١)،
 *            والمدير يعتمد، فتُطبَّق: نجاحٌ ⟵ اجتياز، إخفاقٌ ⟵ إجراء البرنامج (§٧٫٥).
 *
 * التقدّم يُحسب **بالوزن لا بالعدد** (§٧٫٣): الأبواب ليست متساوية.
 */

// ═══════════════ الباب — تتبّع بلا بوابة ═══════════════

async function upsertStageProgress(
  db: PrismaClient | Prisma.TransactionClient,
  studentId: string,
  stageId: string,
  data: Prisma.StageProgressUpdateInput,
): Promise<void> {
  await db.stageProgress.upsert({
    where: { studentId_stageId: { studentId, stageId } },
    update: data,
    create: {
      ...(data as Prisma.StageProgressCreateInput),
      student: { connect: { id: studentId } },
      stage: { connect: { id: stageId } },
    },
  });
}

async function requireStage(
  db: PrismaClient,
  stageId: string,
  kind: StageKind,
): Promise<{ id: string; programId: string; weight: number | null }> {
  const stage = await db.stage.findUnique({
    where: { id: stageId },
    select: { id: true, programId: true, kind: true, weight: true },
  });
  if (!stage) throw new ValidationError("مرحلة غير موجودة.");
  if (stage.kind !== kind) throw new ValidationError("نوع المرحلة غير متوقّع.");
  return { id: stage.id, programId: stage.programId, weight: stage.weight };
}

export interface ChapterMarkArgs {
  studentId: string;
  chapterStageId: string;
  actorId: string;
}

/** يبدأ بابًا (بلا بوابة): يسجّل startedAt والحالة IN_PROGRESS. */
export async function startChapter(
  args: ChapterMarkArgs,
  db: PrismaClient = prisma,
): Promise<void> {
  await requireStage(db, args.chapterStageId, StageKind.CHAPTER);
  await db.$transaction(async (tx) => {
    await upsertStageProgress(tx, args.studentId, args.chapterStageId, {
      state: ProgressState.IN_PROGRESS,
      startedAt: new Date(),
    });
    await emitEvent(tx, {
      type: "CHAPTER_STARTED",
      subjectType: "Stage",
      subjectId: args.chapterStageId,
      actorId: args.actorId,
      payload: { studentId: args.studentId },
    });
  });
}

/** يُتمّ بابًا (بلا بوابة): يسجّل completedAt والحالة COMPLETED. */
export async function completeChapter(
  args: ChapterMarkArgs,
  db: PrismaClient = prisma,
): Promise<void> {
  await requireStage(db, args.chapterStageId, StageKind.CHAPTER);
  await db.$transaction(async (tx) => {
    await upsertStageProgress(tx, args.studentId, args.chapterStageId, {
      state: ProgressState.COMPLETED,
      completedAt: new Date(),
    });
    await emitEvent(tx, {
      type: "CHAPTER_COMPLETED",
      subjectType: "Stage",
      subjectId: args.chapterStageId,
      actorId: args.actorId,
      payload: { studentId: args.studentId },
    });

    // إن اكتملت كلّ أبواب القاعدة ⟵ شهادة القاعدة المدنية (م٥) مرّةً واحدة.
    const stage = await tx.stage.findUnique({ where: { id: args.chapterStageId }, select: { programId: true } });
    if (stage) {
      const total = await tx.stage.count({ where: { programId: stage.programId, kind: StageKind.CHAPTER } });
      const done = await tx.stageProgress.count({ where: { studentId: args.studentId, state: ProgressState.COMPLETED, stage: { programId: stage.programId, kind: StageKind.CHAPTER } } });
      if (total > 0 && done >= total) {
        const already = await tx.certificate.findFirst({ where: { studentId: args.studentId, template: CertificateTemplate.QAIDAH }, select: { id: true } });
        if (!already) {
          await tx.certificate.create({ data: { studentId: args.studentId, template: CertificateTemplate.QAIDAH, verifyToken: randomUUID() } });
        }
      }
    }
  });
}

// ═══════════════ التقدّم — بالوزن لا بالعدد ═══════════════

export interface ProgressByWeight {
  completedWeight: number;
  totalWeight: number;
  percent: number; // 0..100 — بالوزن
  completedChapters: number;
  totalChapters: number;
}

/**
 * تقدّم الطالب في أبواب برنامج، محسوبًا **بالوزن**. الباب بلا وزن يُعامَل وزنه ١.
 * (اختبار القبول: الباب ١٣ لا يساوي ٧٫٧٪ = ١÷١٣.)
 */
export async function computeChapterProgress(
  studentId: string,
  programId: string,
  db: PrismaClient = prisma,
): Promise<ProgressByWeight> {
  const chapters = await db.stage.findMany({
    where: { programId, kind: StageKind.CHAPTER },
    select: { id: true, weight: true },
  });
  const w = (weight: number | null) => (weight == null ? 1 : weight);
  const totalWeight = chapters.reduce((s, c) => s + w(c.weight), 0);
  const totalChapters = chapters.length;
  if (totalChapters === 0) {
    return { completedWeight: 0, totalWeight: 0, percent: 0, completedChapters: 0, totalChapters: 0 };
  }

  const completed = await db.stageProgress.findMany({
    where: {
      studentId,
      state: ProgressState.COMPLETED,
      stage: { programId, kind: StageKind.CHAPTER },
    },
    select: { stage: { select: { weight: true } } },
  });
  const completedWeight = completed.reduce((s, p) => s + w(p.stage.weight), 0);
  const percent = totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 1000) / 10;
  return {
    completedWeight,
    totalWeight,
    percent,
    completedChapters: completed.length,
    totalChapters,
  };
}

// ═══════════════ السلّم البياني (§٧٫٣) — بنية العرض ═══════════════

export interface LadderStep {
  stageId: string;
  ordinal: number;
  nameAr: string;
  weight: number;
  cumulativeWeight: number; // مجموع الأوزان حتى هذه الدرجة (لارتفاع الدرجة)
  milestone: number | null; // رقم المحطة التي يتبعها الباب (التمهيد: null — خارج المحطات)
  objective: string | null; // هدف الباب — يُعرض عند الفتح
  teacherNotes: string | null; // طريقة المؤلف — تُعرض للمعلم عند الفتح
  state: ProgressState | null; // حالة الطالب في هذا الباب (null إن لم يُطلب طالب)
}

export interface Ladder {
  programId: string;
  totalWeight: number;
  steps: LadderStep[];
  progress: ProgressByWeight | null;
}

/** يستخرج نصّ الهدف من حقل objectives (يقبل {items:[..]} أو {objective:".."} أو نصًّا). */
function extractObjective(objectives: Prisma.JsonValue | null | undefined): string | null {
  if (!objectives) return null;
  if (typeof objectives === "string") return objectives;
  if (typeof objectives === "object" && !Array.isArray(objectives)) {
    const rec = objectives as Record<string, unknown>;
    if (Array.isArray(rec.items) && typeof rec.items[0] === "string") return rec.items[0];
    if (typeof rec.objective === "string") return rec.objective;
  }
  return null;
}

/**
 * يبني «السلم البياني» لبرنامج: الأبواب مرتّبة تصاعديًّا بأوزانها التراكمية، مع حالة
 * الطالب (إن طُلب). فارغٌ بأمان قبل بذر الأبواب. لا يفترض عددًا معيّنًا.
 */
export async function getCivilBaseLadder(
  programId: string,
  studentId: string | null = null,
  db: PrismaClient = prisma,
): Promise<Ladder> {
  const chapters = await db.stage.findMany({
    where: { programId, kind: StageKind.CHAPTER },
    orderBy: { ordinal: "asc" },
    select: { id: true, ordinal: true, nameAr: true, weight: true, objectives: true, teacherNotes: true },
  });

  // خريطة الباب ⟵ المحطة، من objectives محطات البرنامج ({chapters:[..]}).
  const milestones = await db.stage.findMany({
    where: { programId, kind: StageKind.MILESTONE },
    select: { ordinal: true, objectives: true },
  });
  const chapterToMilestone = new Map<number, number>();
  for (const m of milestones) {
    const ch = (m.objectives as Record<string, unknown> | null)?.chapters;
    if (Array.isArray(ch)) for (const c of ch) if (typeof c === "number") chapterToMilestone.set(c, m.ordinal);
  }

  const states = new Map<string, ProgressState>();
  if (studentId) {
    const rows = await db.stageProgress.findMany({
      where: { studentId, stage: { programId, kind: StageKind.CHAPTER } },
      select: { stageId: true, state: true },
    });
    for (const r of rows) states.set(r.stageId, r.state);
  }

  let cumulative = 0;
  const steps: LadderStep[] = chapters.map((c) => {
    const weight = c.weight ?? 1;
    cumulative += weight;
    return {
      stageId: c.id,
      ordinal: c.ordinal,
      nameAr: c.nameAr,
      weight,
      cumulativeWeight: cumulative,
      milestone: chapterToMilestone.get(c.ordinal) ?? null,
      objective: extractObjective(c.objectives),
      teacherNotes: c.teacherNotes ?? null,
      state: studentId ? (states.get(c.id) ?? ProgressState.NOT_STARTED) : null,
    };
  });

  return {
    programId,
    totalWeight: cumulative,
    steps,
    progress: studentId ? await computeChapterProgress(studentId, programId, db) : null,
  };
}

export interface LadderView {
  ladder: Ladder | null; // null إن لم يُبذَر البرنامج بعد (حالة فارغة صريحة)
  canSeeTeacherNotes: boolean;
}

/**
 * سلّم القاعدة المدنية للداخل: يحلّ البرنامج بمفتاحه، ويُظهر تقدّم الطالب إن كان الداخل
 * طالبًا، ويحجب teacherNotes عمّن ليس معلمًا/مديرًا (تُعرض للمعلم — §٧٫٦).
 */
export async function getQaidahLadderForViewer(
  viewer: { id: string; roles: Role[] },
  db: PrismaClient = prisma,
): Promise<LadderView> {
  const program = await db.program.findUnique({
    where: { key: ProgramKey.QAIDAH_MADANIYYAH },
    select: { id: true },
  });
  if (!program) return { ladder: null, canSeeTeacherNotes: false };

  const student = await db.student.findUnique({
    where: { userId: viewer.id },
    select: { id: true },
  });
  const ladder = await getCivilBaseLadder(program.id, student?.id ?? null, db);

  const teacherRoles: Role[] = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];
  const canSeeTeacherNotes = viewer.roles.some((r) => teacherRoles.includes(r));
  if (!canSeeTeacherNotes) {
    ladder.steps = ladder.steps.map((s) => ({ ...s, teacherNotes: null }));
  }
  return { ladder, canSeeTeacherNotes };
}

// ═══════════════ المحطة — اختبار + اعتماد ═══════════════

interface MilestonePayload {
  milestoneStageId: string;
  passed: boolean;
  note?: string;
  [k: string]: Prisma.JsonValue | undefined;
}

export interface ProposeMilestoneArgs {
  studentId: string;
  milestoneStageId: string;
  examinerId: string; // ليس معلمه — يُتحقَّق في الخادم
  passed: boolean;
  note?: string;
}

/**
 * المُختبِر يقترح نتيجة محطة. يُتحقَّق في الخادم أنّه ليس معلم الطالب (م١)،
 * ثم يُنشأ اعتمادٌ PENDING من نوع MILESTONE_TRANSITION يعتمده المدير.
 */
export async function proposeMilestoneResult(
  args: ProposeMilestoneArgs,
  db: PrismaClient = prisma,
) {
  await requireStage(db, args.milestoneStageId, StageKind.MILESTONE);
  await assertCanExamine({ examinerUserId: args.examinerId, studentId: args.studentId }, db);

  const payload: MilestonePayload = {
    milestoneStageId: args.milestoneStageId,
    passed: args.passed,
    ...(args.note ? { note: args.note } : {}),
  };
  return propose(
    {
      kind: ApprovalKind.MILESTONE_TRANSITION,
      subjectType: "Student",
      subjectId: args.studentId,
      proposedBy: args.examinerId,
      payload: payload as Prisma.InputJsonValue,
    },
    db,
  );
}

export interface DecideMilestoneArgs {
  approvalId: string;
  decidedBy: string; // المدير (بتفويض)
  decision: "APPROVED" | "REJECTED";
  note?: string;
}

/**
 * المدير يعتمد نتيجة المحطة. عند الاعتماد تُطبَّق النتيجة:
 *   نجاح  ⟵ المحطة COMPLETED (اجتياز).
 *   إخفاق ⟵ إجراء البرنامج (getMilestoneFailureAction): RESET_TO_ZERO أو REPAIR.
 */
export async function decideMilestone(
  args: DecideMilestoneArgs,
  db: PrismaClient = prisma,
) {
  const approval = await decide(
    {
      approvalId: args.approvalId,
      decidedBy: args.decidedBy,
      decision: args.decision,
      note: args.note,
    },
    db,
  );
  if (args.decision !== "APPROVED") return approval;

  const payload = approval.payload as MilestonePayload | null;
  if (!payload || typeof payload.milestoneStageId !== "string") {
    throw new ValidationError("حمولة الاعتماد ناقصة.");
  }
  const stage = await requireStage(db, payload.milestoneStageId, StageKind.MILESTONE);
  const studentId = approval.subjectId;

  await db.$transaction(async (tx) => {
    if (payload.passed) {
      await upsertStageProgress(tx, studentId, payload.milestoneStageId, {
        state: ProgressState.COMPLETED,
        completedAt: new Date(),
      });
      await emitEvent(tx, {
        type: "MILESTONE_PASSED",
        subjectType: "Stage",
        subjectId: payload.milestoneStageId,
        actorId: args.decidedBy,
        payload: { studentId },
      });
    } else {
      const action = await getMilestoneFailureAction(stage.programId, tx as PrismaClient);
      const nextState =
        action === "REPAIR" ? ProgressState.REPAIRING : ProgressState.NOT_STARTED;
      const existing = await tx.stageProgress.findUnique({
        where: { studentId_stageId: { studentId, stageId: payload.milestoneStageId } },
        select: { failureCount: true },
      });
      await upsertStageProgress(tx, studentId, payload.milestoneStageId, {
        state: nextState,
        failureCount: (existing?.failureCount ?? 0) + 1,
        // RESET_TO_ZERO: تصفير التواريخ (§٧٫٥). REPAIR: تبقى للترميم.
        ...(action === "RESET_TO_ZERO" ? { startedAt: null, completedAt: null } : {}),
      });
      await emitEvent(tx, {
        type: "MILESTONE_FAILED",
        subjectType: "Stage",
        subjectId: payload.milestoneStageId,
        actorId: args.decidedBy,
        payload: { studentId, action },
      });
    }
  });
  return approval;
}
