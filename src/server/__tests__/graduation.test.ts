import { ApprovalStatus, ProgramKey, ProgressState, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addOneCalendarMonth,
  decideGraduation,
  listPendingGraduations,
  recordGraduationRound,
  roundEndDate,
  roundsSatisfyGraduation,
  spacingSatisfied,
  type GraduationRoundResult,
} from "../graduation";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══════════════ دوالُّ نقيّة ═══════════════

describe("مهلة الشهر ونهاية الجولة (الحكم ٧، التخرّج)", () => {
  it("نهاية الجولة = البداية + (الجلسات − ١)", () => {
    expect(roundEndDate("2026-03-01", 1)).toBe("2026-03-01");
    expect(roundEndDate("2026-03-01", 3)).toBe("2026-03-03");
  });

  it("شهرٌ ميلاديّ: ٢٩ يومًا يُرفض، ٣١ يُقبل", () => {
    expect(addOneCalendarMonth("2026-03-15")).toBe("2026-04-15");
    expect(spacingSatisfied("2026-03-15", "2026-04-13")).toBe(false); // ٢٩ يومًا
    expect(spacingSatisfied("2026-03-15", "2026-04-15")).toBe(true); // ٣١ يومًا
  });

  it("الجولات الثلاث مُلزِمة، وبينها مهلةٌ صحيحة", () => {
    const r = (startedOn: string) => ({ startedOn, plannedSessions: 1 });
    expect(roundsSatisfyGraduation([r("2026-01-01"), r("2026-02-01")])).toBe(false); // جولتان
    expect(roundsSatisfyGraduation([r("2026-01-01"), r("2026-02-01"), r("2026-03-01")])).toBe(true);
    expect(roundsSatisfyGraduation([r("2026-01-01"), r("2026-01-30"), r("2026-03-01")])).toBe(false); // فجوةٌ ٢٩ يومًا
  });
});

// ═══════════════ التكامل ═══════════════

// طالبٌ أتمّ المرحلة السادسة (٣ أحزاب = كامل محفوظه)، ومُسمِّعٌ محايد، ومدير.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main6 = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 6, nameAr: "الأصلية السادسة" },
  });
  const mk = (ordinal: number, hizb: number, fs: number, fa: number, ts: number, ta: number) =>
    prisma.stage.create({
      data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal, nameAr: `ح${hizb}`, parentId: main6.id, hizbNumber: hizb, fromSurah: fs, fromAyah: fa, toSurah: ts, toAyah: ta },
    });
  const h3 = await mk(1, 3, 2, 142, 2, 202);
  const h2 = await mk(2, 2, 2, 75, 2, 141);
  const h1 = await mk(3, 1, 1, 1, 2, 74);
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  for (const s of [h1, h2, h3]) {
    await prisma.stageProgress.create({
      data: { studentId: student.id, stageId: s.id, state: ProgressState.COMPLETED, startedAt: new Date(), completedAt: new Date() },
    });
  }
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, main6, h1, h2, h3, student, reciter, manager };
}

function round(s: Awaited<ReturnType<typeof scaffold>>, startedOn: string): Promise<GraduationRoundResult> {
  return recordGraduationRound(
    {
      studentId: s.student.id, mainStageId: s.main6.id, examinerId: s.reciter.id, startedOn,
      hizbs: [{ stageId: s.h1.id, errors: [] }, { stageId: s.h2.id, errors: [] }, { stageId: s.h3.id, errors: [] }],
    },
    prisma,
  );
}

describe("جولات التخرّج والاعتماد (الحكم ٧، المرحلة ٨)", () => {
  it("جولتان ← لا اقتراح تخرّج؛ الثالثة بمهلةٍ صحيحة ← اقتراح GRADUATION", async () => {
    const s = await scaffold();
    const r1 = await round(s, "2026-01-01");
    const r2 = await round(s, "2026-02-01");
    expect(r1.graduationProposalId).toBeNull();
    expect(r2.graduationProposalId).toBeNull(); // الجولات الثلاث مُلزِمة
    const r3 = await round(s, "2026-03-01");
    expect(r3.graduationProposalId).not.toBeNull();
    const appr = await prisma.approval.findUniqueOrThrow({ where: { id: r3.graduationProposalId! } });
    expect(appr.kind).toBe("GRADUATION");
    // لا STAGE_TRANSITION (جولات التخرّج تعطّله).
    expect(await prisma.approval.count({ where: { kind: "STAGE_TRANSITION" } })).toBe(0);
  });

  it("مهلةٌ ناقصة (فجوةٌ ٢٩ يومًا) ← لا اقتراح تخرّج ولو نجحت ثلاثٌ", async () => {
    const s = await scaffold();
    await round(s, "2026-01-01");
    await round(s, "2026-01-30"); // ٢٩ يومًا بعد نهاية الأولى
    const r3 = await round(s, "2026-03-01");
    expect(r3.graduationProposalId).toBeNull();
  });

  it("لا تخرّج بلا اعتماد؛ والرفض ← لا حالة ولا شهادة", async () => {
    const s = await scaffold();
    await round(s, "2026-01-01");
    await round(s, "2026-02-01");
    const r3 = await round(s, "2026-03-01");
    // قبل الحسم: ليس متخرّجًا ولا شهادة.
    let st = await prisma.student.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(st.state).not.toBe(StudentState.GRADUATED);
    expect(await prisma.certificate.count({ where: { studentId: s.student.id } })).toBe(0);

    const res = await decideGraduation({ approvalId: r3.graduationProposalId!, decidedBy: s.manager.id, decision: "REJECTED", note: "يعيد جولةً" }, prisma);
    expect(res.graduated).toBe(false);
    st = await prisma.student.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(st.state).not.toBe(StudentState.GRADUATED);
    expect(await prisma.certificate.count({ where: { studentId: s.student.id } })).toBe(0);
  });

  it("اعتماد ← الحالة GRADUATED ثمّ شهادة KHATM (بعد تغيّر الحالة لا قبله)", async () => {
    const s = await scaffold();
    await round(s, "2026-01-01");
    await round(s, "2026-02-01");
    const r3 = await round(s, "2026-03-01");
    const res = await decideGraduation({ approvalId: r3.graduationProposalId!, decidedBy: s.manager.id, decision: "APPROVED" }, prisma);
    expect(res.graduated).toBe(true);
    expect(res.certificateId).not.toBeNull();
    const st = await prisma.student.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(st.state).toBe(StudentState.GRADUATED);
    const cert = await prisma.certificate.findUniqueOrThrow({ where: { id: res.certificateId! } });
    expect(cert.template).toBe("KHATM");
    expect(cert.studentId).toBe(s.student.id);
    const appr = await prisma.approval.findUniqueOrThrow({ where: { id: r3.graduationProposalId! } });
    expect(appr.status).toBe(ApprovalStatus.APPROVED);
  });

  it("اللوحة: تعرض اقتراح التخرّج المعلَّق، ويختفي بعد الحسم", async () => {
    const s = await scaffold();
    await round(s, "2026-01-01");
    await round(s, "2026-02-01");
    const r3 = await round(s, "2026-03-01");
    const pending = await listPendingGraduations(prisma);
    expect(pending).toHaveLength(1);
    expect(pending[0].approvalId).toBe(r3.graduationProposalId);
    await decideGraduation({ approvalId: r3.graduationProposalId!, decidedBy: s.manager.id, decision: "APPROVED" }, prisma);
    expect(await listPendingGraduations(prisma)).toHaveLength(0);
  });
});
