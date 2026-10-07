import { MuddakirPhase, ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getWardView, recordWardComplete, deriveWard } from "../muddakir-ward";
import { ensureMuddakirProfile } from "../muddakir-profile";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, seedHizbBoundaries } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ت٣ (§١٢): محرّك يوم الورد — الطور TATHBIT، البدء اليوم التالي للسرد الختاميّ، أوراد اليوم بحدودها.

const LADDER = [
  [1, 1, 30, 3], [2, 2, 15, 2], [3, 3, 10, 3], [4, 4, 8, 4], [5, 5, 6, 5],
  [6, 6, 5, 6], [7, 7, 5, 7], [8, 8, 4, 8], [9, 9, 4, 9], [10, 10, 3, 10],
] as const;

/** حافظٌ في طور التثبيت، درجته ١، بدأ وردُه من اليوم (سردٌ ختاميٌّ أمسِ). */
async function tathbitStudent(finalRecitedOn: string) {
  await createProgram(prisma, ProgramKey.MUDDAKIR);
  await seedHizbBoundaries(prisma);
  await prisma.muddakirTathbitDegree.createMany({ data: LADDER.map(([degreeNo, dailyJuz, khatmaDays, khatmaCount]) => ({ degreeNo, dailyJuz, khatmaDays, khatmaCount })) });
  const { student } = await createStudent(prisma);
  await ensureMuddakirProfile(prisma, student.id);
  await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { phase: MuddakirPhase.TATHBIT, tathbitDegree: 1 } });
  await prisma.muddakirRecitation.create({ data: { studentId: student.id, kind: "FINAL", stage: 6, passed: true, examinerId: "ex", recitedOn: new Date(`${finalRecitedOn}T00:00:00.000Z`) } });
  return student;
}

const NOW = new Date("2026-06-02T09:00:00.000Z"); // اليوم بمكّة = 2026-06-02

describe("getWardView — أوّل يوم تثبيت (الدرجة ١: جزءٌ يوميّاً)", () => {
  it("ورد اليوم = الجزء ١ (من الفاتحة)، الحالة OPEN", async () => {
    const student = await tathbitStudent("2026-06-01"); // البدء = الغد = اليوم
    const v = await getWardView(student.id, prisma, NOW);
    expect(v).toMatchObject({ active: true, phase: "TATHBIT", degreeNo: 1, dailyJuz: 1, status: "OPEN" });
    expect(v.wards).toHaveLength(1);
    expect(v.wards[0]).toMatchObject({ fromJuz: 1, toJuz: 1 });
    expect(v.wards[0].bound).toMatchObject({ fromSurah: 1, fromAyah: 1 }); // الفاتحة ١:١
  });

  it("إتمام ورد اليوم ⟵ المؤشّر يتقدّم والحالة COMPLETE", async () => {
    const student = await tathbitStudent("2026-06-01");
    await recordWardComplete({ studentId: student.id, clientEventId: "w1", occurredAt: NOW }, prisma, NOW);
    const p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p.wardsCompleted).toBe(1);
    const v = await getWardView(student.id, prisma, NOW);
    expect(v.status).toBe("COMPLETE");
    // التكرار idempotent على clientEventId (لا يتقدّم مرّتين).
    await recordWardComplete({ studentId: student.id, clientEventId: "w1", occurredAt: NOW }, prisma, NOW);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).wardsCompleted).toBe(1);
  });

  it("فائتُ الأمس يُعرض أوّلاً ثمّ ورد اليوم (تعويض، تعديل ١)", async () => {
    const student = await tathbitStudent("2026-05-31"); // البدء = 2026-06-01، واليوم 06-02 ⟵ الأمس فائت
    const v = await getWardView(student.id, prisma, NOW);
    expect(v.wards).toHaveLength(2); // الفائت (الجزء ١) ثمّ اليوم (الجزء ٢)
    expect(v.wards[0]).toMatchObject({ fromJuz: 1 });
    expect(v.wards[1]).toMatchObject({ fromJuz: 2 });
  });

  it("deriveWard يُسقط يوم الورد بحالته", async () => {
    const student = await tathbitStudent("2026-06-01");
    await deriveWard(prisma, student.id, NOW);
    const row = await prisma.muddakirWardDay.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row).toMatchObject({ phase: "TATHBIT", degreeNo: 1, status: "OPEN" });
  });

  it("غير المتخرّج (MEMORIZE) ⟵ لا ورد", async () => {
    await createProgram(prisma, ProgramKey.MUDDAKIR);
    const { student } = await createStudent(prisma);
    await ensureMuddakirProfile(prisma, student.id);
    const v = await getWardView(student.id, prisma, NOW);
    expect(v.active).toBe(false);
  });
});
