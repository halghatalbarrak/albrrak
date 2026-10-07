import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ensureMuddakirProfile } from "../muddakir-profile";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// المرحلة ت١ (§١٢): نموذج التثبيت وإعداداته — بلا منطقٍ ولا شاشات. اختباراتٌ للبنية والافتراضات.

// سلّم §١٢ المعتمد (جزء اليوم × أيّام الختمة × عدد الختمات) — يُبذَر في الترحيل ويحرّره المدير.
const LADDER: [number, number, number, number][] = [
  [1, 1, 30, 3], [2, 2, 15, 2], [3, 3, 10, 3], [4, 4, 8, 4], [5, 5, 6, 5],
  [6, 6, 5, 6], [7, 7, 5, 7], [8, 8, 4, 8], [9, 9, 4, 9], [10, 10, 3, 10],
];

describe("ملفّ الحافظ — افتراضات التثبيت", () => {
  it("حافظٌ جديد في طور الحفظ (MEMORIZE) وعدّاداتُ التثبيت صفرٌ", async () => {
    await createProgram(prisma, ProgramKey.MUDDAKIR);
    const { student } = await createStudent(prisma);
    await ensureMuddakirProfile(prisma, student.id);
    const p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p.phase).toBe("MEMORIZE");
    expect(p.tathbitDegree).toBeNull();
    expect(p).toMatchObject({ khatmaInDegree: 0, wardsCompleted: 0, cumulativeKhatmat: 0 });
  });
});

describe("سلّم التثبيت (MuddakirTathbitDegree)", () => {
  it("العشر درجاتٌ بقيم §١٢، مفتاحُها degreeNo فريد", async () => {
    await prisma.muddakirTathbitDegree.createMany({
      data: LADDER.map(([degreeNo, dailyJuz, khatmaDays, khatmaCount]) => ({ degreeNo, dailyJuz, khatmaDays, khatmaCount })),
    });
    const rows = await prisma.muddakirTathbitDegree.findMany({ orderBy: { degreeNo: "asc" } });
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => [r.degreeNo, r.dailyJuz, r.khatmaDays, r.khatmaCount])).toEqual(LADDER);
    expect(rows.every((r) => r.active)).toBe(true);
    // عدد ختمات الدرجة = أجزاؤها اليوميّة (من الثانية فصاعداً)، والأولى ٣.
    for (const r of rows) expect(r.khatmaCount).toBe(r.degreeNo === 1 ? 3 : r.dailyJuz);
    // أيّام الختمة = ⌈٣٠ ÷ أجزاء اليوم⌉.
    for (const r of rows) expect(r.khatmaDays).toBe(Math.ceil(30 / r.dailyJuz));
  });
});

describe("إسقاط يوم الورد (MuddakirWardDay)", () => {
  it("يومٌ واحدٌ لكلّ حافظ، والحالة الابتدائيّة OPEN", async () => {
    const { student } = await createStudent(prisma);
    await prisma.muddakirWardDay.create({
      data: { studentId: student.id, dayDate: new Date("2026-06-01T00:00:00.000Z"), phase: "TATHBIT", degreeNo: 1, khatmaNo: 1 },
    });
    const row = await prisma.muddakirWardDay.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe("OPEN");
    expect(row.wardsCompleted).toBe(0);
    await expect(
      prisma.muddakirWardDay.create({ data: { studentId: student.id, dayDate: new Date("2026-06-01T00:00:00.000Z"), phase: "TATHBIT", degreeNo: 1, khatmaNo: 1 } }),
    ).rejects.toThrow(); // قيد (studentId, dayDate) الفريد
  });
});
