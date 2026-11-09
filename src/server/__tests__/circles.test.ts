import { Gender, ProgramKey, TimeSlot } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCircle, listCircles, listPrograms, normalizeCircleName, updateCircle } from "../circles";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createUser } from "../testing/factories";

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

describe("normalizeCircleName", () => {
  it("يُزيل التشكيل ويبقي الحروف", () => {
    expect(normalizeCircleName("حَلَقَةُ الفَجْرِ")).toBe("حلقة الفجر");
  });
  it("يوحّد همزات الألف (أإآٱ → ا)", () => {
    expect(normalizeCircleName("إبراهيم")).toBe("ابراهيم");
    expect(normalizeCircleName("آل البيت")).toBe("ال البيت");
  });
  it("يُزيل التطويل", () => {
    expect(normalizeCircleName("حلقـة")).toBe("حلقة");
  });
});

describe("createCircle — تكرار الاسم (بالتنزيه)", () => {
  it("يرمي circleNameDuplicate إن وُجدت حلقة نشطة بنفس الاسم", async () => {
    await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE" } });
    await expect(
      createCircle({ nameAr: "حلقة الفجر", timeSlot: "ASR", gender: "MALE" }, prisma),
    ).rejects.toMatchObject({ key: "circleNameDuplicate" });
  });

  it("يرمي circleNameDuplicate للاسم المشكَّل إذا طابق حلقةً غير مشكَّلة", async () => {
    await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE" } });
    await expect(
      createCircle({ nameAr: "حَلَقَةُ الفَجْرِ", timeSlot: "ASR", gender: "MALE" }, prisma),
    ).rejects.toMatchObject({ key: "circleNameDuplicate" });
  });

  it("يرمي circleNameInTrash إن كانت حلقةٌ محذوفة بالاسم نفسه", async () => {
    const c = await prisma.circle.create({ data: { nameAr: "حلقة المحذوفة", timeSlot: "MAGHRIB", gender: "MALE" } });
    await prisma.circle.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    await expect(
      createCircle({ nameAr: "حلقة المحذوفة", timeSlot: "ASR", gender: "MALE" }, prisma),
    ).rejects.toMatchObject({ key: "circleNameInTrash" });
  });

  it("ينجح إن كان الاسم مختلفًا", async () => {
    await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE" } });
    const result = await createCircle({ nameAr: "حلقة المغرب", timeSlot: "ASR", gender: "MALE" }, prisma);
    expect(result.nameAr).toBe("حلقة المغرب");
  });
});

describe("updateCircle — تكرار الاسم (بالتنزيه)", () => {
  it("يرمي circleNameDuplicate عند التعديل لاسمٍ مشكَّل يطابق حلقةً أخرى", async () => {
    const actor = await createUser(prisma);
    await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE" } });
    const c2 = await prisma.circle.create({ data: { nameAr: "حلقة المغرب", timeSlot: "MAGHRIB", gender: "MALE" } });
    await expect(
      updateCircle(actor.id, c2.id, { nameAr: "حَلَقَةُ الفَجْرِ", timeSlot: "MAGHRIB", gender: "MALE" }, prisma),
    ).rejects.toMatchObject({ key: "circleNameDuplicate" });
  });
});

describe("listCircles — بلا محذوفات", () => {
  it("لا تظهر الحلقات المحذوفة ناعمًا في القائمة", async () => {
    const c = await prisma.circle.create({ data: { nameAr: "حلقة مؤرشفة", timeSlot: "MAGHRIB", gender: "MALE" } });
    await prisma.circle.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
    const circles = await listCircles(prisma);
    expect(circles.find((x) => x.id === c.id)).toBeUndefined();
  });
});
