import { Gender, ProgramKey, TimeSlot } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCircle, listCircles, listPrograms } from "../circles";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("إدارة الحلقات الأدنى", () => {
  it("إنشاء حلقة تحت برنامج ← تظهر في القائمة بمعلومات برنامجها", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const c = await createCircle(
      { nameAr: "حلقة الفجر", timeSlot: TimeSlot.MAGHRIB, gender: Gender.MALE, programId: program.id },
      prisma,
    );
    const circles = await listCircles(prisma);
    const row = circles.find((x) => x.id === c.id);
    expect(row?.nameAr).toBe("حلقة الفجر");
    expect(row?.programKey).toBe(ProgramKey.QAIDAH_MADANIYYAH);
  });

  it("البرامج المبذورة تظهر", async () => {
    await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const programs = await listPrograms(prisma);
    expect(programs.some((p) => p.key === ProgramKey.QAIDAH_MADANIYYAH)).toBe(true);
  });

  it("برنامج غير موجود ← يُرفض", async () => {
    await expect(
      createCircle({ nameAr: "x", timeSlot: TimeSlot.ASR, gender: Gender.FEMALE, programId: "nope" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("اسم فارغ ← يُرفض", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    await expect(
      createCircle({ nameAr: "  ", timeSlot: TimeSlot.ASR, gender: Gender.MALE, programId: program.id }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
