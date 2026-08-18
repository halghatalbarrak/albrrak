import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { searchAll } from "../search";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("searchAll (الفكرة ٨) — طلاب/حلقات/مصحف", () => {
  it("يجد الطالب بالاسم ويوجّه لخريطته", async () => {
    const { student } = await createStudent(prisma);
    await prisma.user.update({ where: { id: (await prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { userId: true } })).userId }, data: { nameAsInId: "خالد بن عبدالله" } });
    const r = await searchAll("خالد", prisma);
    expect(r.students).toHaveLength(1);
    expect(r.students[0].href).toBe(`/admin/students/${student.id}/weakness`);
  });

  it("يجد الحلقة بالاسم", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
    const r = await searchAll("الفجر", prisma);
    expect(r.circles[0].href).toBe(`/admin/circles/${circle.id}/weakness`);
  });

  it("«١١٤:١» يوجّه لوجه المصحف الذي يحوي الآية", async () => {
    await seedMushafFaces(prisma);
    const r = await searchAll("114:1", prisma);
    expect(r.mushaf).toHaveLength(1);
    expect(r.mushaf[0].href).toMatch(/^\/mushaf\/\d+$/);
  });

  it("رقم سورةٍ وحده يوجّه لأوّل وجهها", async () => {
    await seedMushafFaces(prisma);
    const r = await searchAll("114", prisma);
    expect(r.mushaf[0].label).toContain("سورة 114");
  });

  it("أقلّ من حرفين ⟵ لا نتائج", async () => {
    const r = await searchAll("خ", prisma);
    expect(r.students.concat(r.circles, r.mushaf)).toHaveLength(0);
  });
});
