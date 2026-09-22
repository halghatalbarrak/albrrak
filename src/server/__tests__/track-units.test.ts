import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { generateTrackUnits, MARAQI_SURAH_ORDER, SURAH_AYAH_COUNTS } from "../../../scripts/track-units-gen.mjs";
import { nextUnitForStudent, progressInTrack, unitsForTrack } from "../track-units";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══════════════ التوليد (نقيّ — منطق البذر) ═══════════════

// أسطرٌ حقيقيّة: الفاتحة (صفحة ١)، والمسد (صفحة ٦٠٣)، والإخلاص+الفلق+الناس (صفحة ٦٠٤).
const LINES = [
  // الفاتحة — ٧ آيات على ٦ أسطر (صفحة ١)
  { page: 1, lineNo: 1, startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 1 },
  { page: 1, lineNo: 2, startSurah: 1, startAyah: 2, endSurah: 1, endAyah: 2 },
  { page: 1, lineNo: 3, startSurah: 1, startAyah: 3, endSurah: 1, endAyah: 4 },
  { page: 1, lineNo: 4, startSurah: 1, startAyah: 5, endSurah: 1, endAyah: 5 },
  { page: 1, lineNo: 5, startSurah: 1, startAyah: 6, endSurah: 1, endAyah: 6 },
  { page: 1, lineNo: 6, startSurah: 1, startAyah: 7, endSurah: 1, endAyah: 7 },
  // المسد (١١١) — ٥ آيات (صفحة ٦٠٣)
  { page: 603, lineNo: 14, startSurah: 111, startAyah: 1, endSurah: 111, endAyah: 3 },
  { page: 603, lineNo: 15, startSurah: 111, startAyah: 4, endSurah: 111, endAyah: 5 },
  // الإخلاص (١١٢) — ٤ آيات (صفحة ٦٠٤)
  { page: 604, lineNo: 3, startSurah: 112, startAyah: 1, endSurah: 112, endAyah: 3 },
  { page: 604, lineNo: 4, startSurah: 112, startAyah: 4, endSurah: 112, endAyah: 4 },
  // الفلق (١١٣) — ٥ آيات (صفحة ٦٠٤)
  { page: 604, lineNo: 7, startSurah: 113, startAyah: 1, endSurah: 113, endAyah: 3 },
  { page: 604, lineNo: 8, startSurah: 113, startAyah: 4, endSurah: 113, endAyah: 5 },
  // الناس (١١٤) — ٦ آيات (صفحة ٦٠٤)
  { page: 604, lineNo: 12, startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 3 },
  { page: 604, lineNo: 13, startSurah: 114, startAyah: 4, endSurah: 114, endAyah: 5 },
  { page: 604, lineNo: 14, startSurah: 114, startAyah: 6, endSurah: 114, endAyah: 6 },
];

const CUM: number[] = (() => { const c = [0, 0]; for (let s = 1; s <= 114; s++) c[s + 1] = c[s] + SURAH_AYAH_COUNTS[s]; return c; })();
const ord = (s: number, a: number) => CUM[s] + a;
type U = { startSurah: number; startAyah: number; endSurah: number; endAyah: number };

/** يتحقّق أن الوحدات تغطّي كل آيات المدخل مرّةً واحدة (لا فجوة ولا تداخل)، والآية لا تُكسَر. */
function assertCoversExactly(units: U[], lines: typeof LINES) {
  const expected = new Set<number>();
  for (const l of lines) for (let o = ord(l.startSurah, l.startAyah); o <= ord(l.endSurah, l.endAyah); o++) expected.add(o);
  const seen: number[] = [];
  for (const u of units) {
    expect(Number.isInteger(u.startAyah) && Number.isInteger(u.endAyah)).toBe(true); // الآية لا تُكسَر
    for (let o = ord(u.startSurah, u.startAyah); o <= ord(u.endSurah, u.endAyah); o++) seen.push(o);
  }
  expect(seen.length).toBe(new Set(seen).size); // لا تداخل
  expect(new Set(seen)).toEqual(expected); // لا فجوة (تغطيةٌ كاملة)
}

describe("generateTrackUnits — مسارات الأسطر (٣، ٥)", () => {
  it("٣ أسطر: تغطيةٌ كاملة، الآية لا تُكسَر، لا تتجاوز الوحدة السورة", () => {
    const units = generateTrackUnits(LINES, 3);
    assertCoversExactly(units, LINES);
    for (const u of units) expect(u.startSurah).toBe(u.endSurah); // مسار أسطرٍ: داخل السورة
    expect(units[0]).toMatchObject({ startSurah: 1, startAyah: 1 }); // الفاتحة أوّلاً
  });

  it("الاتّجاه تنازليّ بالسور: الناس (١١٤) قبل الفلق (١١٣) قبل الإخلاص (١١٢) قبل المسد (١١١)", () => {
    const units = generateTrackUnits(LINES, 5);
    const seq = [...new Set(units.map((u) => u.startSurah))];
    const idx = seq.map((s) => MARAQI_SURAH_ORDER.indexOf(s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b)); // بترتيب مراقي
    expect(seq).toEqual([1, 114, 113, 112, 111]);
  });
});

describe("generateTrackUnits — مسارات الصفحات (نصف صفحة، صفحة، صفحتان)", () => {
  it("«صفحة» (١٥): الوحدة = صفحةٌ فعليّة. ١=الفاتحة · ٢=صفحة ٦٠٤ (١١٢:١→١١٤:٦) · ٣=صفحة ٦٠٣ (١١١)", () => {
    const units = generateTrackUnits(LINES, 15);
    assertCoversExactly(units, LINES);
    expect(units).toHaveLength(3);
    expect(units[0]).toMatchObject({ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 });
    expect(units[1]).toMatchObject({ startSurah: 112, startAyah: 1, endSurah: 114, endAyah: 6 });
    expect(units[2]).toMatchObject({ startSurah: 111, startAyah: 1, endSurah: 111, endAyah: 5 });
  });

  it("«صفحتان» (٣٠): الفاتحة وحدها، ثمّ صفحتا ٦٠٤+٦٠٣ وحدةً (١١١:١→١١٤:٦)", () => {
    const units = generateTrackUnits(LINES, 30);
    assertCoversExactly(units, LINES);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 });
    expect(units[1]).toMatchObject({ startSurah: 111, startAyah: 1, endSurah: 114, endAyah: 6 });
  });

  it("«نصف صفحة» (٧٫٥): الفاتحة كاملةً، والصفحة نصفين — تغطيةٌ كاملة، أكثر وحداتٍ من «صفحة»", () => {
    const half = generateTrackUnits(LINES, 7.5);
    assertCoversExactly(half, LINES);
    expect(half[0]).toMatchObject({ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 }); // الفاتحة كاملة
    expect(half.length).toBeGreaterThan(generateTrackUnits(LINES, 15).length);
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
