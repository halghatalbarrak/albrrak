import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getConsolidation, getWeeklyReview } from "../tarseekh";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createStudent, seedMaraqiTrackForStudent, type SeedUnit } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// مراقي ٢: الترسيخ = `tarseekhUnits` وحدةً سابقة؛ الراسخ = ما قبلها، يُوزَّع على `reviewDaysPerWeek`.
// موضع الطالب يُضبط بالتسكين (MaraqiPlacement.reachedSurah/Ayah) ليتحكّم بعدد الوحدات المبلوغة.

const DAY = 86400000;
// وحداتٌ في سورة البقرة (آخر ترتيب مراقي) بخمس آياتٍ لكلّ وحدة — مفتاحٌ تصاعديّ بالآية.
const mkUnits = (n: number): SeedUnit[] =>
  Array.from({ length: n }, (_, i) => ({ unitNo: i + 1, startSurah: 2, startAyah: 5 * i + 1, endSurah: 2, endAyah: 5 * i + 5 }));

async function setup(unitCount: number, reached: number, policy?: { tarseekhUnits?: number; reviewDaysPerWeek?: number }) {
  const { student } = await createStudent(prisma);
  await seedMaraqiTrackForStudent(prisma, student.id, { units: mkUnits(unitCount), ...policy });
  if (reached > 0) {
    // بلغ آخرَ آيةٍ في الوحدة reached (5·reached) ⟵ reached وحداتٍ مبلوغة.
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 2, reachedAyah: 5 * reached } });
  }
  const prog = await prisma.program.findUniqueOrThrow({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
  const circle = await createCircle(prisma, prog.id);
  return { student, circle };
}

describe("نافذة الترسيخ الوحدويّة (مراقي ٢) — `tarseekhUnits` وحدةً سابقة", () => {
  it("أقلّ من النافذة ← كلّ المبلوغ ترسيخ، ولا راسخ", async () => {
    const { student } = await setup(5, 3);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(3);
    expect(c.review.stockCount).toBe(0);
    expect(c.review.khums).toBe(0);
  });

  it("النافذة بالضبط ← كلّها ترسيخ، لا راسخ", async () => {
    const { student } = await setup(12, 10);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(10);
    expect(c.review.stockCount).toBe(0);
  });

  it("فوق النافذة ← آخر ١٠ ترسيخ، والأقدم راسخ", async () => {
    const { student } = await setup(12, 12);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(10);
    expect(c.tarseekh.segments.map((s) => s.id)).toEqual(["u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "u11", "u12"]);
    expect(c.review.segments.map((s) => s.id).sort()).toEqual(["u1", "u2"]);
    expect(c.review.stockCount).toBe(2);
    expect(c.review.khums).toBe(1); // ⌈٢ ÷ ٥⌉
  });

  it("الموضع (التسكين) يتحكّم بعدد الوحدات المبلوغة", async () => {
    const { student } = await setup(20, 5); // بلغ ٥ فقط
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(5);
    expect(c.review.stockCount).toBe(0);
  });

  it("المقادير لكلّ مسار: نافذة ترسيخ ٣ ← الباقي راسخ", async () => {
    const { student } = await setup(10, 10, { tarseekhUnits: 3 });
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(3);
    expect(c.review.stockCount).toBe(7);
  });
});

describe("المراجعة الوحدويّة (مراقي ٢)", () => {
  it("المقدار اليوميّ = ⌈الراسخ ÷ أيّام المراجعة⌉", async () => {
    const { student } = await setup(26, 26); // راسخ ١٦، أيّام ٥ ← ⌈١٦ ÷ ٥⌉ = ٤
    const c = await getConsolidation(student.id, prisma);
    expect(c.review.stockCount).toBe(16);
    expect(c.review.khums).toBe(4);
  });

  it("فارغٌ بأمان بلا مسارٍ أو قبل أوّل حفظ", async () => {
    const { student } = await createStudent(prisma);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(0);
    expect(c.review.stockCount).toBe(0);
  });
});

async function addReview(studentId: string, circleId: string, dateUTC: Date, count: number) {
  await prisma.dailySession.create({ data: { studentId, circleId, date: dateUTC, murajaahCount: count, murajaahDone: count > 0 } });
}

describe("دورة المراجعة الأسبوعية بالمقدار", () => {
  it("المُنجَز يتراكم عبر أيّام الأسبوع، وتكتمل عند بلوغ المطلوب (الراسخ)", async () => {
    const { student, circle } = await setup(15, 15); // راسخ = ١٥ − ١٠ = ٥
    const ref = new Date(Date.UTC(2026, 2, 4));
    const sunday = new Date(ref.getTime() - ref.getUTCDay() * DAY);

    await addReview(student.id, circle.id, sunday, 2);
    let wr = await getWeeklyReview(student.id, sunday, prisma);
    expect(wr.required).toBe(5);
    expect(wr.done).toBe(2);
    expect(wr.complete).toBe(false);

    await addReview(student.id, circle.id, new Date(sunday.getTime() + DAY), 2);
    await addReview(student.id, circle.id, new Date(sunday.getTime() + 2 * DAY), 1);
    wr = await getWeeklyReview(student.id, new Date(sunday.getTime() + 2 * DAY), prisma);
    expect(wr.done).toBe(5);
    expect(wr.remaining).toBe(0);
    expect(wr.complete).toBe(true);
  });

  it("لا راسخ ⟵ الدورة مكتملةٌ حكمًا", async () => {
    const { student } = await createStudent(prisma);
    const wr = await getWeeklyReview(student.id, new Date(Date.UTC(2026, 2, 4)), prisma);
    expect(wr.required).toBe(0);
    expect(wr.complete).toBe(true);
    expect(wr.percent).toBe(100);
  });
});
