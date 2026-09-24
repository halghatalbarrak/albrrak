import { ProgramHistoryReason, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { enrollStudent } from "../enrollment";
import { getUnifiedBoard } from "../unified-session";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function programs() {
  const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
  const qaidah = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  return { maraqi, qaidah };
}

// ═══ ق١: البرنامج صفةٌ في القيد ═══
describe("enrollStudent يكتب البرنامج في القيد ويسجّله في التاريخ (ق١/ق٦)", () => {
  it("إسنادٌ أوّل ⟵ programId = برنامج الحلقة + تاريخٌ ASSIGNMENT", async () => {
    const { maraqi } = await programs();
    const circle = await createCircle(prisma, maraqi.id);
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student } = await createStudent(prisma);

    await enrollStudent({ studentId: student.id, circleId: circle.id, actorId: mgr.id }, prisma);

    const enr = await prisma.enrollment.findFirstOrThrow({ where: { studentId: student.id, endedAt: null } });
    expect(enr.programId).toBe(maraqi.id);
    const hist = await prisma.programEnrollmentHistory.findMany({ where: { studentId: student.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ programId: maraqi.id, reason: ProgramHistoryReason.ASSIGNMENT, exitedAt: null });
  });

  it("النقل بين برنامجين ⟵ يُغلق التاريخ القديم ويفتح CHANGE بالبرنامج الجديد", async () => {
    const { maraqi, qaidah } = await programs();
    const cMaraqi = await createCircle(prisma, maraqi.id);
    const cQaidah = await createCircle(prisma, qaidah.id);
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student } = await createStudent(prisma);

    await enrollStudent({ studentId: student.id, circleId: cMaraqi.id, actorId: mgr.id }, prisma);
    await enrollStudent({ studentId: student.id, circleId: cQaidah.id, actorId: mgr.id }, prisma);

    const active = await prisma.enrollment.findFirstOrThrow({ where: { studentId: student.id, endedAt: null } });
    expect(active.programId).toBe(qaidah.id); // البرنامج الجديد من القيد
    const hist = await prisma.programEnrollmentHistory.findMany({ where: { studentId: student.id }, orderBy: { enteredAt: "asc" } });
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({ programId: maraqi.id, reason: ProgramHistoryReason.ASSIGNMENT });
    expect(hist[0].exitedAt).not.toBeNull(); // أُغلق القديم
    expect(hist[1]).toMatchObject({ programId: qaidah.id, reason: ProgramHistoryReason.CHANGE, exitedAt: null });
  });
});

// ═══ حلقةٌ مختلطة البرامج: لكلّ طالبٍ لوحة برنامجه (ق١) ═══
describe("getUnifiedBoard يعرض لكلّ طالبٍ لوحة برنامجه في حلقةٍ مختلطة", () => {
  it("طالب مراقي ⟵ today (لا qaidah)، وطالب قاعدة ⟵ qaidah block", async () => {
    const { maraqi, qaidah } = await programs();
    const circle = await createCircle(prisma, maraqi.id); // الافتراضيّ مراقي
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student: mStu } = await createStudent(prisma);
    const { student: qStu } = await createStudent(prisma);
    // مراقي بالافتراض، والقاعدة ببرنامجٍ مغايرٍ في نفس الحلقة (قيدٌ يحمل برنامجه).
    await prisma.enrollment.create({ data: { studentId: mStu.id, circleId: circle.id, programId: maraqi.id } });
    await prisma.enrollment.create({ data: { studentId: qStu.id, circleId: circle.id, programId: qaidah.id } });
    await prisma.student.update({ where: { id: mStu.id }, data: { state: StudentState.IN_MARAQI } });
    await prisma.student.update({ where: { id: qStu.id }, data: { state: StudentState.IN_QAIDAH } });

    const board = await getUnifiedBoard(mgr.id, circle.id, "2026-05-10", prisma);
    const m = board.students.find((s) => s.studentId === mStu.id)!;
    const q = board.students.find((s) => s.studentId === qStu.id)!;
    expect(m.program).toBe(ProgramKey.MARAQI);
    expect(m.qaidah).toBeNull();
    expect(q.program).toBe(ProgramKey.QAIDAH_MADANIYYAH);
    expect(q.qaidah).not.toBeNull(); // كتلة درس القاعدة (ولو بلا بذر: started=false)
  });

  it("قيدٌ بلا programId (بيانات قديمة) ⟵ ارتدادٌ لبرنامج الحلقة", async () => {
    const { maraqi } = await programs();
    const circle = await createCircle(prisma, maraqi.id);
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } }); // programId=null
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });

    const board = await getUnifiedBoard(mgr.id, circle.id, "2026-05-10", prisma);
    expect(board.students.find((s) => s.studentId === student.id)?.program).toBe(ProgramKey.MARAQI);
  });
});
