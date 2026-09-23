import { ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { todayTarget } from "../today-target";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// وحداتٌ بترتيب مراقي (الفاتحة ثمّ الناس نزولاً): [سورة, من, إلى].
const UNITS: [number, number, number][] = [
  [1, 1, 7], [114, 1, 6], [113, 1, 5], [112, 1, 4], [111, 1, 5], [110, 1, 3], [109, 1, 6],
  [108, 1, 3], [107, 1, 7], [106, 1, 4], [105, 1, 5], [104, 1, 9], [103, 1, 3], [102, 1, 8],
];

async function scaffold(withTrack = true) {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const track = await prisma.track.create({ data: { programId: program.id, nameAr: "صفحة", linesPerDay: 15, ordinal: 4 } });
  await prisma.trackUnit.createMany({ data: UNITS.map(([s, a, b], i) => ({ trackId: track.id, unitNo: i + 1, startSurah: s, startAyah: a, endSurah: s, endAyah: b })) });
  if (withTrack) await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });
  return { program, circle, student, track };
}

async function memorize(studentId: string, circleId: string, unit: [number, number, number], date: string, mastered = true) {
  const [s, a, b] = unit;
  await prisma.dailySession.create({
    data: { studentId, circleId, date: new Date(date), hifzFromSurah: s, hifzFromAyah: a, hifzToSurah: s, hifzToAyah: b, hifzMastered: mastered },
  });
}

// حفظ أوّل n وحدة بتواريخ متتالية (٢٠٢٥-١١-٠١ فصاعدًا).
async function memorizeFirst(studentId: string, circleId: string, n: number) {
  for (let i = 0; i < n; i++) await memorize(studentId, circleId, UNITS[i], `2025-11-${String(i + 1).padStart(2, "0")}`);
}

const SUNDAY = "2026-01-04"; // الأحد (١ يناير ٢٠٢٦ خميس) ⟵ حصّة المراجعة اليوم ١

describe("todayTarget — وجهة اليوم (م٤)", () => {
  it("عيّنةٌ كاملة: حفظ ١٣ صفحة ← المقترح صفحة ١٤، ترسيخٌ ١٠، مراجعةٌ يوم ١", async () => {
    const { student, circle } = await scaffold();
    await memorizeFirst(student.id, circle.id, 13);
    const t = await todayTarget(student.id, SUNDAY);

    // اطبع العيّنة للمراجعة البصريّة.
    console.log("\n═══ عيّنة todayTarget (طالبٌ حفظ ١٣ صفحة، الأحد) ═══\n" + JSON.stringify(t, null, 2));

    expect(t.status).toBe("ACTIVE");
    // ١) الحفظ الجديد المقترح = الوحدة ١٤ (١٠٢:١ → ١٠٢:٨).
    expect(t.newHifz).toEqual({ kind: "NEW", bound: { fromSurah: 102, fromAyah: 1, toSurah: 102, toAyah: 8 } });
    // ٢) الترسيخ = آخر ١٠ (الوحدات ٤..١٣: من الإخلاص ١١٢ إلى العصر ١٠٣).
    expect(t.tarseekh).toHaveLength(10);
    expect(t.tarseekh[0]).toEqual({ fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 4 });
    expect(t.tarseekh[9]).toEqual({ fromSurah: 103, fromAyah: 1, toSurah: 103, toAyah: 3 });
    // ٣) المراجعة: الراسخ ٣ (الوحدات ١..٣)، حصّة الأحد = الأحدث (الفلق ١١٣).
    expect(t.murajaah?.dayNo).toBe(1);
    expect(t.murajaah?.totalStock).toBe(3);
    expect(t.murajaah?.todaySlice).toEqual([{ fromSurah: 113, fromAyah: 1, toSurah: 113, toAyah: 5 }]);
  });

  it("طالبٌ جديد (لا حفظ) ← المقترح = الوحدة ١ (الفاتحة)", async () => {
    const { student } = await scaffold();
    const t = await todayTarget(student.id, SUNDAY);
    expect(t.newHifz).toEqual({ kind: "NEW", bound: { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 } });
    expect(t.tarseekh).toHaveLength(0);
  });

  it("الحكم ١: مقطع أمس لم يُتقن ← المقترح إعادةٌ لا جديد", async () => {
    const { student, circle } = await scaffold();
    await memorize(student.id, circle.id, [114, 1, 6], "2026-01-03", false); // أمس، لم يُتقن
    const t = await todayTarget(student.id, SUNDAY);
    expect(t.newHifz).toEqual({ kind: "REPEAT", bound: { fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6 } });
  });

  it("في إجازة مرحلة ← لا وجهة (ON_LEAVE)", async () => {
    const { student } = await scaffold();
    await prisma.stageExamLeave.create({
      data: { studentId: student.id, mainStageId: "main-x", startedOn: new Date("2026-01-01"), baseEndsOn: new Date("2999-01-01"), effectiveEndsOn: new Date("2999-01-01") },
    });
    const t = await todayTarget(student.id, SUNDAY);
    expect(t.status).toBe("ON_LEAVE");
    expect(t.newHifz).toBeNull();
  });

  it("بلا مسارٍ مُسنَد ← NO_TRACK", async () => {
    const { student, circle } = await scaffold(false); // لا trackAssignment
    await memorize(student.id, circle.id, UNITS[0], "2025-11-01");
    const t = await todayTarget(student.id, SUNDAY);
    expect(t.newHifz).toEqual({ kind: "NO_TRACK" });
  });

  it("أتمّ محفوظ المسار ← COMPLETED", async () => {
    const { student, circle } = await scaffold();
    await memorizeFirst(student.id, circle.id, UNITS.length); // كل الوحدات
    const t = await todayTarget(student.id, SUNDAY);
    expect(t.newHifz).toEqual({ kind: "COMPLETED" });
  });

  it("الترسيخ لا يشمل حفظ اليوم", async () => {
    const { student, circle } = await scaffold();
    await memorizeFirst(student.id, circle.id, 3);
    await memorize(student.id, circle.id, UNITS[3], SUNDAY); // حفظُ اليوم
    const t = await todayTarget(student.id, SUNDAY);
    expect(t.tarseekh).toHaveLength(3); // الثلاثة السابقة فقط، لا اليوم
    expect(t.tarseekh.some((b) => b.fromSurah === UNITS[3][0])).toBe(false);
  });
});
