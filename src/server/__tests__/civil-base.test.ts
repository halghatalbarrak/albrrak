import { ApprovalStatus, ProgramKey, ProgressState, Role, StageKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AuthorizationError } from "../errors";
import {
  completeChapter,
  computeChapterProgress,
  decideMilestone,
  proposeMilestoneResult,
  startChapter,
} from "../civil-base";
import { setMilestoneFailureAction } from "../settings";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// أوزان أبواب القاعدة المدنية (DESIGN §٧٫٢) — الإجمالي ٨٧.
const CHAPTER_WEIGHTS = [8, 14, 8, 8, 10, 4, 4, 4, 4, 4, 8, 8, 3];

async function seedChapters(programId: string) {
  const chapters = [];
  for (let i = 0; i < CHAPTER_WEIGHTS.length; i++) {
    chapters.push(
      await prisma.stage.create({
        data: {
          programId,
          kind: StageKind.CHAPTER,
          ordinal: i + 1,
          nameAr: `الباب ${i + 1}`,
          weight: CHAPTER_WEIGHTS[i],
        },
      }),
    );
  }
  return chapters;
}

async function createMilestone(programId: string, ordinal = 1) {
  return prisma.stage.create({
    data: { programId, kind: StageKind.MILESTONE, ordinal, nameAr: `المحطة ${ordinal}` },
  });
}

describe("القاعدة المدنية — التقدّم بالوزن لا بالعدد (§٧٫٣)", () => {
  it("الباب ١٣ (وزن ٣) لا يساوي ٧٫٧٪ = ١÷١٣", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const chapters = await seedChapters(program.id);
    const { student } = await createStudent(prisma);

    await completeChapter(
      { studentId: student.id, chapterStageId: chapters[12].id, actorId: student.userId },
      prisma,
    );

    const p = await computeChapterProgress(student.id, program.id, prisma);
    expect(p.totalWeight).toBe(87);
    expect(p.completedWeight).toBe(3);
    expect(p.percent).toBeCloseTo(3.4, 1); // ٣÷٨٧
    expect(p.percent).not.toBe(7.7); // ليس بالعدد
    expect(p.completedChapters).toBe(1);
  });
});

describe("القاعدة المدنية — الباب بلا بوابة", () => {
  it("startChapter ثم completeChapter يسجّلان التواريخ والحالة", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const [ch] = await seedChapters(program.id);
    const { student } = await createStudent(prisma);

    await startChapter({ studentId: student.id, chapterStageId: ch.id, actorId: student.userId });
    let sp = await prisma.stageProgress.findUniqueOrThrow({
      where: { studentId_stageId: { studentId: student.id, stageId: ch.id } },
    });
    expect(sp.state).toBe(ProgressState.IN_PROGRESS);
    expect(sp.startedAt).not.toBeNull();

    await completeChapter({ studentId: student.id, chapterStageId: ch.id, actorId: student.userId });
    sp = await prisma.stageProgress.findUniqueOrThrow({
      where: { studentId_stageId: { studentId: student.id, stageId: ch.id } },
    });
    expect(sp.state).toBe(ProgressState.COMPLETED);
    expect(sp.completedAt).not.toBeNull();
  });
});

describe("القاعدة المدنية — المحطة: المُختبِر ليس معلمه (م١، §٧٫٤)", () => {
  it("اقتراح المعلم اختبارَ طالبه ← يُرفض في الخادم", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const milestone = await createMilestone(program.id);
    const { student } = await createStudent(prisma);
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });

    await expect(
      proposeMilestoneResult(
        { studentId: student.id, milestoneStageId: milestone.id, examinerId: teacher.id, passed: true },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("مُختبِرٌ ليس معلمه ← ينشئ اعتمادًا PENDING", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const milestone = await createMilestone(program.id);
    const { student } = await createStudent(prisma);
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });

    const approval = await proposeMilestoneResult(
      { studentId: student.id, milestoneStageId: milestone.id, examinerId: examiner.id, passed: true },
      prisma,
    );
    expect(approval.status).toBe(ApprovalStatus.PENDING);
  });
});

describe("القاعدة المدنية — إخفاق المحطة يطبّق إعداد البرنامج (§٧٫٥)", () => {
  it("RESET_TO_ZERO (الافتراضي): الاعتماد على إخفاق ← الحالة NOT_STARTED وعدّاد الإخفاق +١", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const milestone = await createMilestone(program.id);
    const { student } = await createStudent(prisma);
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });

    const approval = await proposeMilestoneResult(
      { studentId: student.id, milestoneStageId: milestone.id, examinerId: examiner.id, passed: false },
      prisma,
    );
    await decideMilestone(
      { approvalId: approval.id, decidedBy: manager.id, decision: "APPROVED" },
      prisma,
    );

    const sp = await prisma.stageProgress.findUniqueOrThrow({
      where: { studentId_stageId: { studentId: student.id, stageId: milestone.id } },
    });
    expect(sp.state).toBe(ProgressState.NOT_STARTED);
    expect(sp.failureCount).toBe(1);
  });

  it("REPAIR: نفس الإخفاق ← الحالة REPAIRING (بلا نشر — بتغيير الإعداد)", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const milestone = await createMilestone(program.id);
    const { student } = await createStudent(prisma);
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });

    await setMilestoneFailureAction(program.id, "REPAIR", manager.id, prisma);

    const approval = await proposeMilestoneResult(
      { studentId: student.id, milestoneStageId: milestone.id, examinerId: examiner.id, passed: false },
      prisma,
    );
    await decideMilestone(
      { approvalId: approval.id, decidedBy: manager.id, decision: "APPROVED" },
      prisma,
    );

    const sp = await prisma.stageProgress.findUniqueOrThrow({
      where: { studentId_stageId: { studentId: student.id, stageId: milestone.id } },
    });
    expect(sp.state).toBe(ProgressState.REPAIRING);
  });

  it("اجتياز: الاعتماد على نجاح ← المحطة COMPLETED", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const milestone = await createMilestone(program.id);
    const { student } = await createStudent(prisma);
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });

    const approval = await proposeMilestoneResult(
      { studentId: student.id, milestoneStageId: milestone.id, examinerId: examiner.id, passed: true },
      prisma,
    );
    await decideMilestone(
      { approvalId: approval.id, decidedBy: manager.id, decision: "APPROVED" },
      prisma,
    );

    const sp = await prisma.stageProgress.findUniqueOrThrow({
      where: { studentId_stageId: { studentId: student.id, stageId: milestone.id } },
    });
    expect(sp.state).toBe(ProgressState.COMPLETED);
  });
});
