import { ApprovalStatus, ProgramKey, ProgressState, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordStageExam, type HizbExamInput } from "../stage-exam";
import { decideRetake, decideStageTransition, listPendingStageTransitions } from "../stage-transition";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const err = (pageNo: number) => ({ pageNo, errorType: "WORD" as const });

// طالبٌ أتمّ ثلاثة أحزاب، ومُسمِّعٌ محايد، ومدير.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية الأولى" },
  });
  const mk = (ordinal: number, hizb: number, fs: number, fa: number, ts: number, ta: number) =>
    prisma.stage.create({
      data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal, nameAr: `ح${hizb}`, parentId: main.id, hizbNumber: hizb, fromSurah: fs, fromAyah: fa, toSurah: ts, toAyah: ta },
    });
  const h60 = await mk(1, 60, 87, 1, 114, 6);
  const h59 = await mk(2, 59, 78, 1, 86, 17);
  const h58 = await mk(3, 58, 72, 1, 77, 50);
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  for (const s of [h60, h59, h58]) {
    await prisma.stageProgress.create({
      data: { studentId: student.id, stageId: s.id, state: ProgressState.COMPLETED, startedAt: new Date(), completedAt: new Date() },
    });
  }
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, main, h60, h59, h58, student, reciter, manager };
}

const allClean = (a: string, b: string, c: string): HizbExamInput[] => [
  { stageId: a, errors: [] }, { stageId: b, errors: [] }, { stageId: c, errors: [] },
];

async function passExam(s: Awaited<ReturnType<typeof scaffold>>) {
  return recordStageExam(
    { studentId: s.student.id, mainStageId: s.main.id, examinerId: s.reciter.id, startedOn: "2026-03-01", hizbs: allClean(s.h60.id, s.h59.id, s.h58.id) },
    prisma,
  );
}

function mainProgress(studentId: string, mainId: string) {
  return prisma.stageProgress.findUnique({ where: { studentId_stageId: { studentId, stageId: mainId } } });
}

describe("اعتماد المدير + الانتقال (الحكم ٧، المرحلة ٧)", () => {
  it("نجاح الاختبار ⟵ اقتراح STAGE_TRANSITION معلَّق تلقائيًّا", async () => {
    const s = await scaffold();
    const out = await passExam(s);
    expect(out.status).toBe("PASSED");
    expect(out.approvalId).not.toBeNull();
    const appr = await prisma.approval.findUniqueOrThrow({ where: { id: out.approvalId! } });
    expect(appr.kind).toBe("STAGE_TRANSITION");
    expect(appr.status).toBe(ApprovalStatus.PENDING);
    // لا انتقال بعدُ: المرحلة الأصلية لم تُتمّ.
    expect(await mainProgress(s.student.id, s.main.id)).toBeNull();
  });

  it("اعتماد المدير ⟵ ينتقل (المرحلة الأصلية COMPLETED)", async () => {
    const s = await scaffold();
    const out = await passExam(s);
    const res = await decideStageTransition(
      { approvalId: out.approvalId!, decidedBy: s.manager.id, decision: "APPROVED" },
      prisma,
    );
    expect(res.transitioned).toBe(true);
    const p = await mainProgress(s.student.id, s.main.id);
    expect(p?.state).toBe(ProgressState.COMPLETED);
    const appr = await prisma.approval.findUniqueOrThrow({ where: { id: out.approvalId! } });
    expect(appr.status).toBe(ApprovalStatus.APPROVED);
    expect(await prisma.event.count({ where: { type: "MAIN_STAGE_TRANSITION" } })).toBe(1);
  });

  it("لا انتقال بلا اعتماد: الرفض ⟵ المرحلة لا تُتمّ", async () => {
    const s = await scaffold();
    const out = await passExam(s);
    const res = await decideStageTransition(
      { approvalId: out.approvalId!, decidedBy: s.manager.id, decision: "REJECTED", note: "يعيد الحزب الأخير" },
      prisma,
    );
    expect(res.transitioned).toBe(false);
    expect(await mainProgress(s.student.id, s.main.id)).toBeNull();
    // الرفض بلا سببٍ يُرفض.
    const out2 = await recordStageExam(
      { studentId: s.student.id, mainStageId: s.main.id, examinerId: s.reciter.id, startedOn: "2026-04-01", hizbs: allClean(s.h60.id, s.h59.id, s.h58.id) },
      prisma,
    );
    await expect(
      decideStageTransition({ approvalId: out2.approvalId!, decidedBy: s.manager.id, decision: "REJECTED" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("اللوحة: تعرض الاقتراح المعلَّق للمدير", async () => {
    const s = await scaffold();
    await passExam(s);
    const pending = await listPendingStageTransitions(prisma);
    expect(pending).toHaveLength(1);
    expect(pending[0].mainStageLabel).toBe("الأصلية الأولى");
    expect(pending[0].finalRank).toBe("EXCELLENT");
  });

  it("الراسب: المدير يسجّل قرار الإعادة ونطاقها (لا قاعدة آلية)", async () => {
    const s = await scaffold();
    const failing: HizbExamInput[] = [
      { stageId: s.h60.id, errors: [] },
      { stageId: s.h59.id, errors: Array.from({ length: 6 }, (_, i) => err(i + 1)) },
      { stageId: s.h58.id, errors: [] },
    ];
    const out = await recordStageExam(
      { studentId: s.student.id, mainStageId: s.main.id, examinerId: s.reciter.id, startedOn: "2026-03-01", hizbs: failing },
      prisma,
    );
    expect(out.status).toBe("FAILED");
    expect(out.approvalId).toBeNull(); // لا اقتراح للراسب

    await decideRetake(
      { examId: out.examId, decidedBy: s.manager.id, scopeNote: "يعيد حزب ٥٩ خلال أسبوع", deadline: "2026-03-10" },
      prisma,
    );
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "RETAKE_DECIDED", subjectId: out.examId } });
    expect(ev.actorId).toBe(s.manager.id); // من اتّخذ القرار

    // قرار إعادةٍ لاختبارٍ ناجح ← يُرفض.
    const ok = await passExam(s);
    await expect(
      decideRetake({ examId: ok.examId, decidedBy: s.manager.id, scopeNote: "x" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
