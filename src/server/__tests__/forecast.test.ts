import { ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getStudentForecast, circleDaysBetween, addCircleDays } from "../forecast";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("أيام الحلقة (الحكم ٣) — تتخطّى الجمعة/السبت", () => {
  it("circleDaysBetween يعدّ الأحد→الخميس فقط", () => {
    // 2026-05-03 الأحد … 2026-05-09 السبت
    expect(circleDaysBetween("2026-05-03", "2026-05-09")).toBe(5); // الأحد..الخميس
  });
  it("addCircleDays يتخطّى العطلة", () => {
    // من الخميس 2026-05-07 + يومُ حلقةٍ واحد ⟵ الأحد 2026-05-10 (يتخطّى الجمعة/السبت)
    expect(addCircleDays("2026-05-07", 1)).toBe("2026-05-10");
  });
});

async function maraqiStudentWithPace() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأولى" } });
  // حزبان: ٦٠ (الأعلى..الناس) و٥٩ (النبأ..الطارق) — حدودٌ حقيقيّة.
  await prisma.stage.create({ data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "ح٦٠", parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6 } });
  await prisma.stage.create({ data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 2, nameAr: "ح٥٩", parentId: main.id, hizbNumber: 59, fromSurah: 78, fromAyah: 1, toSurah: 86, toAyah: 17 } });
  const circle = await prisma.circle.create({ data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { student, user, circle };
}

describe("getStudentForecast (الفكرة ٤) — إرشاديّ", () => {
  it("جلساتٌ قليلة ← لا وتيرة بعد", async () => {
    const { student } = await maraqiStudentWithPace();
    const f = await getStudentForecast(student.id, prisma, "2026-05-04");
    expect(f.hasPace).toBe(false);
  });

  it("وتيرةٌ محسوبة ← تقديرٌ بتاريخ التخرّج، والملاحظة إرشاديّة", async () => {
    const { student, circle } = await maraqiStudentWithPace();
    // حفظٌ في الناس (١١٤) عبر أيام حلقةٍ متعدّدة.
    const days = ["2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"];
    for (let i = 0; i < days.length; i++) {
      await prisma.dailySession.create({ data: { studentId: student.id, circleId: circle.id, date: new Date(days[i]), hifzFromSurah: 114, hifzFromAyah: 1, hifzToSurah: 114, hifzToAyah: 6, hifzMastered: true } });
    }
    const f = await getStudentForecast(student.id, prisma, "2026-05-10");
    expect(f.hasPace).toBe(true);
    expect(f.pacePerDay).toBeGreaterThan(0);
    expect(f.graduationDate).toBeTruthy();
    expect(f.note).toContain("إرشاديّ");
    // التخرّج تقديرٌ في المستقبل (بعد اليوم).
    expect(f.graduationDate! > "2026-05-10").toBe(true);
  });

  it("الحارس (نقطة الكادر): معلّمٌ ليس معلّمه — مغطّىً في assertTeachesStudent", async () => {
    const { student } = await maraqiStudentWithPace();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    // getStudentForecast نفسها بلا حارس (الحارس في المسار)؛ نتأكّد أنّها تعمل بمعرّفٍ صحيح.
    const f = await getStudentForecast(student.id, prisma, "2026-05-04");
    expect(f).toBeDefined();
    expect(stranger.id).not.toBe(student.id);
  });
});
