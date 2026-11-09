import { Gender, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { searchAll } from "../search";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const adminActor = { id: "admin-id", roles: [Role.SUPER_ADMIN] };

describe("searchAll (الفكرة ٨) — طلاب/حلقات/مصحف", () => {
  it("يجد الطالب بالاسم ويوجّه لصفحته", async () => {
    const { student } = await createStudent(prisma);
    await prisma.user.update({ where: { id: (await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { userId: true } })).userId }, data: { nameAsInId: "خالد بن عبدالله" } });
    const r = await searchAll("خالد", adminActor, prisma);
    expect(r.students).toHaveLength(1);
    expect(r.students[0].href).toBe(`/admin/students/${student.id}`);
  });

  it("يجد الحلقة بالاسم ويوجّه لصفحتها", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
    const r = await searchAll("الفجر", adminActor, prisma);
    expect(r.circles[0].href).toBe(`/admin/circles/${circle.id}`);
  });

  it("«١١٤:١» يوجّه لوجه المصحف الذي يحوي الآية", async () => {
    await seedMushafFaces(prisma);
    const r = await searchAll("114:1", adminActor, prisma);
    expect(r.mushaf).toHaveLength(1);
    expect(r.mushaf[0].href).toMatch(/^\/mushaf\/\d+$/);
  });

  it("رقم سورةٍ وحده يوجّه لأوّل وجهها", async () => {
    await seedMushafFaces(prisma);
    const r = await searchAll("114", adminActor, prisma);
    expect(r.mushaf[0].label).toContain("سورة 114");
  });

  it("أقلّ من حرفين ⟵ لا نتائج", async () => {
    const r = await searchAll("خ", adminActor, prisma);
    expect(r.students.concat(r.circles, r.mushaf)).toHaveLength(0);
  });

  it("المعلّم لا يرى طلابًا خارج حلقته", async () => {
    const teacherUser = await prisma.user.create({ data: { nameAsInId: "معلّم", gender: Gender.MALE, roles: [Role.TEACHER] } });
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const myCircle = await prisma.circle.create({ data: { nameAr: "حلقتي", timeSlot: "ASR", gender: "MALE", programId: program.id } });
    const otherCircle = await prisma.circle.create({ data: { nameAr: "حلقةٌ أخرى", timeSlot: "ASR", gender: "MALE", programId: program.id } });
    await prisma.circleTeacher.create({ data: { circleId: myCircle.id, teacherId: teacherUser.id } });

    const { student: mine } = await createStudent(prisma);
    await prisma.enrollment.updateMany({ where: { studentId: mine.id, endedAt: null }, data: { circleId: myCircle.id } });
    await prisma.user.update({ where: { id: (await prisma.student.findUniqueOrThrow({ where: { id: mine.id }, select: { userId: true } })).userId }, data: { nameAsInId: "طالبٌ في حلقتي" } });

    const { student: other } = await createStudent(prisma);
    await prisma.enrollment.updateMany({ where: { studentId: other.id, endedAt: null }, data: { circleId: otherCircle.id } });
    await prisma.user.update({ where: { id: (await prisma.student.findUniqueOrThrow({ where: { id: other.id }, select: { userId: true } })).userId }, data: { nameAsInId: "طالبٌ في حلقةٍ أخرى" } });

    const teacherActor = { id: teacherUser.id, roles: [Role.TEACHER] };
    const r = await searchAll("طالب", teacherActor, prisma);
    expect(r.students).toHaveLength(1);
    expect(r.students[0].href).toBe(`/admin/students/${mine.id}`);
  });

  it("الحلقة المحذوفة لا تظهر في نتائج البحث", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await prisma.circle.create({ data: { nameAr: "حلقة المحذوفة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
    await prisma.circle.update({ where: { id: circle.id }, data: { deletedAt: new Date() } });
    const r = await searchAll("المحذوفة", adminActor, prisma);
    expect(r.circles).toHaveLength(0);
  });

  it("الطالب المحذوف لا يظهر في نتائج البحث", async () => {
    const { student } = await createStudent(prisma);
    await prisma.user.update({ where: { id: (await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { userId: true } })).userId }, data: { nameAsInId: "طالب محذوف" } });
    await prisma.student.update({ where: { id: student.id }, data: { deletedAt: new Date() } });
    const r = await searchAll("محذوف", adminActor, prisma);
    expect(r.students).toHaveLength(0);
  });
});
