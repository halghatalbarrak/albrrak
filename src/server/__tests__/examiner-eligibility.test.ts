import { ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { canExamine, eligibleExaminers } from "../examiner-eligibility";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("أهلية المُختبِر — ليس معلمه (م١، §٧٫٤)", () => {
  it("معلم الطالب لا يجوز أن يختبره؛ غيره يجوز", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const circle = await createCircle(prisma, program.id);
    const { student } = await createStudent(prisma);
    const ownTeacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const other = await createUser(prisma, { roles: [Role.TEACHER] });
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: ownTeacher.id } });

    expect(await canExamine({ examinerUserId: ownTeacher.id, studentId: student.id }, prisma)).toBe(false);
    expect(await canExamine({ examinerUserId: other.id, studentId: student.id }, prisma)).toBe(true);
  });

  it("طالب بلا انتساب ← أيّ مُختبِر مؤهّل", async () => {
    const anyTeacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const { student } = await createStudent(prisma);
    expect(await canExamine({ examinerUserId: anyTeacher.id, studentId: student.id }, prisma)).toBe(true);
  });

  it("eligibleExaminers يستبعد معلمي الطالب — وإن خلت القائمة نبّه المدير", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const circle = await createCircle(prisma, program.id);
    const { student } = await createStudent(prisma);
    const ownTeacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: ownTeacher.id } });

    // المعلم الوحيد هو معلمه ⟵ لا مُختبِر متاح (قائمة فارغة ⟵ على الواجهة تنبيه المدير).
    expect(await eligibleExaminers(student.id, prisma)).toEqual([]);

    const other = await createUser(prisma, { roles: [Role.TEACHER] });
    const otherCircle = await createCircle(prisma, program.id);
    await prisma.circleTeacher.create({ data: { circleId: otherCircle.id, teacherId: other.id } });
    expect(await eligibleExaminers(student.id, prisma)).toEqual([other.id]);
  });
});
