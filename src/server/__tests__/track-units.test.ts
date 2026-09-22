import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { generateTrackUnits, MARAQI_SURAH_ORDER, SURAH_AYAH_COUNTS } from "../../../scripts/track-units-gen.mjs";
import { nextUnitForStudent, progressInTrack, unitsForTrack } from "../track-units";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══════════════ التوليد (نقيّ — منطق البذر) ═══════════════

// أسطرٌ حقيقيّة لثلاث سور: الفاتحة (صفحة ١)، الإخلاص والناس (صفحة ٦٠٤).
const LINES = [
  // الفاتحة — ٧ آيات على ٦ أسطر
  { page: 1, lineNo: 1, startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 1 },
  { page: 1, lineNo: 2, startSurah: 1, startAyah: 2, endSurah: 1, endAyah: 2 },
  { page: 1, lineNo: 3, startSurah: 1, startAyah: 3, endSurah: 1, endAyah: 4 },
  { page: 1, lineNo: 4, startSurah: 1, startAyah: 5, endSurah: 1, endAyah: 5 },
  { page: 1, lineNo: 5, startSurah: 1, startAyah: 6, endSurah: 1, endAyah: 6 },
  { page: 1, lineNo: 6, startSurah: 1, startAyah: 7, endSurah: 1, endAyah: 7 },
  // الإخلاص (١١٢) — ٤ آيات على سطرين
  { page: 604, lineNo: 3, startSurah: 112, startAyah: 1, endSurah: 112, endAyah: 3 },
  { page: 604, lineNo: 4, startSurah: 112, startAyah: 4, endSurah: 112, endAyah: 4 },
  // الناس (١١٤) — ٦ آيات على ٤ أسطر
  { page: 604, lineNo: 12, startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 3 },
  { page: 604, lineNo: 13, startSurah: 114, startAyah: 3, endSurah: 114, endAyah: 5 },
  { page: 604, lineNo: 14, startSurah: 114, startAyah: 5, endSurah: 114, endAyah: 5 },
  { page: 604, lineNo: 15, startSurah: 114, startAyah: 6, endSurah: 114, endAyah: 6 },
];

/** يتحقّق أن وحدات كل سورةٍ تغطّيها كاملةً بلا فجوةٍ ولا تداخل، والآية لا تُكسَر. */
function assertSurahCoverage(units: { startSurah: number; startAyah: number; endSurah: number; endAyah: number }[]) {
  const bySurah = new Map<number, typeof units>();
  for (const u of units) {
    expect(u.startSurah).toBe(u.endSurah); // الوحدة داخل سورةٍ واحدة
    expect(Number.isInteger(u.startAyah) && Number.isInteger(u.endAyah)).toBe(true); // الآية لا تُكسَر
    if (!bySurah.has(u.startSurah)) bySurah.set(u.startSurah, []);
    bySurah.get(u.startSurah)!.push(u);
  }
  for (const [surah, us] of bySurah) {
    us.sort((a, b) => a.startAyah - b.startAyah);
    expect(us[0].startAyah).toBe(1); // تبدأ من الآية ١
    expect(us[us.length - 1].endAyah).toBe(SURAH_AYAH_COUNTS[surah]); // تنتهي بآخر آية
    for (let i = 1; i < us.length; i++) expect(us[i].startAyah).toBe(us[i - 1].endAyah + 1); // بلا فجوة/تداخل
  }
}

describe("generateTrackUnits — التقسيم المسبق (البند ٢)", () => {
  it("مسار ٣ أسطر: تغطيةٌ كاملةٌ بلا فجوة، والآية لا تُكسَر", () => {
    const units = generateTrackUnits(LINES, 3);
    assertSurahCoverage(units);
    expect(units.map((u) => u.unitNo)).toEqual(units.map((_, i) => i + 1)); // ترقيمٌ متتالٍ
  });

  it("الاتّجاه تنازليّ: الوحدة ١ من الفاتحة، ثمّ الناس قبل الإخلاص (ترتيب مراقي)", () => {
    const units = generateTrackUnits(LINES, 15);
    expect(units[0].startSurah).toBe(1); // الفاتحة أوّلاً
    expect(units[0].startAyah).toBe(1);
    // ترتيب السور في الوحدات يتبع ترتيب مراقي (الفاتحة ← الناس ١١٤ ← الإخلاص ١١٢).
    const surahSeq = [...new Set(units.map((u) => u.startSurah))];
    const orderIdx = surahSeq.map((s) => MARAQI_SURAH_ORDER.indexOf(s));
    expect(orderIdx).toEqual([...orderIdx].sort((a, b) => a - b));
    expect(surahSeq).toEqual([1, 114, 112]); // الناس قبل الإخلاص (نزولاً)
  });

  it("مسار «صفحة» (١٥ سطر): السورة القصيرة وحدةٌ واحدة (لا تتجاوز السورة)", () => {
    const units = generateTrackUnits(LINES, 15);
    const nas = units.filter((u) => u.startSurah === 114);
    expect(nas).toHaveLength(1);
    expect(nas[0]).toMatchObject({ startAyah: 1, endAyah: 6 });
  });
});

// ═══════════════ دوالّ الاستعلام (تركيبات) ═══════════════

async function scaffold(linesPerDay = 15) {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const track = await prisma.track.create({ data: { programId: program.id, nameAr: "صفحة", linesPerDay, ordinal: 4 } });
  const circle = await createCircle(prisma, program.id);
  const { student } = await createStudent(prisma);
  await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });
  // وحداتٌ بترتيب مراقي: الفاتحة، الناس، الفلق.
  await prisma.trackUnit.createMany({
    data: [
      { trackId: track.id, unitNo: 1, startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 },
      { trackId: track.id, unitNo: 2, startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6 },
      { trackId: track.id, unitNo: 3, startSurah: 113, startAyah: 1, endSurah: 113, endAyah: 5 },
    ],
  });
  return { student, circle, track };
}

async function memorize(studentId: string, circleId: string, date: string, toSurah: number, toAyah: number) {
  await prisma.dailySession.create({
    data: { studentId, circleId, date: new Date(date), hifzFromSurah: toSurah, hifzFromAyah: 1, hifzToSurah: toSurah, hifzToAyah: toAyah, hifzMastered: true },
  });
}

describe("دوالّ وحدات المسار (تخدم وجهة اليوم)", () => {
  it("unitsForTrack: كل الوحدات مرتّبةً", async () => {
    const { track } = await scaffold();
    const units = await unitsForTrack(track.id);
    expect(units.map((u) => u.unitNo)).toEqual([1, 2, 3]);
  });

  it("nextUnitForStudent: لم يبدأ ← الوحدة ١ (الفاتحة)", async () => {
    const { student } = await scaffold();
    expect(await nextUnitForStudent(student.id)).toMatchObject({ unitNo: 1, startSurah: 1 });
  });

  it("nextUnitForStudent: بعد حفظ الفاتحة ← الناس؛ وبعد الناس ← الفلق", async () => {
    const { student, circle } = await scaffold();
    await memorize(student.id, circle.id, "2026-04-01", 1, 7);
    expect(await nextUnitForStudent(student.id)).toMatchObject({ unitNo: 2, startSurah: 114 });
    await memorize(student.id, circle.id, "2026-04-02", 114, 6);
    expect(await nextUnitForStudent(student.id)).toMatchObject({ unitNo: 3, startSurah: 113 });
  });

  it("progressInTrack: نسبةٌ صحيحة (٠ → ٣٣ → ٦٧)", async () => {
    const { student, circle } = await scaffold();
    expect(await progressInTrack(student.id)).toEqual({ currentUnitNo: 0, totalUnits: 3, percent: 0 });
    await memorize(student.id, circle.id, "2026-04-01", 1, 7);
    expect(await progressInTrack(student.id)).toEqual({ currentUnitNo: 1, totalUnits: 3, percent: 33 });
    await memorize(student.id, circle.id, "2026-04-02", 114, 6);
    expect(await progressInTrack(student.id)).toEqual({ currentUnitNo: 2, totalUnits: 3, percent: 67 });
  });

  it("طالبٌ بلا مسارٍ مُسنَد ← null", async () => {
    const { student: s2 } = await createStudent(prisma);
    expect(await nextUnitForStudent(s2.id)).toBeNull();
    expect(await progressInTrack(s2.id)).toBeNull();
  });
});
