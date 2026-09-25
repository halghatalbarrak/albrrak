import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SURAH_AYAH_COUNTS } from "../../server/quran-ordinal";
import { SURAH_NAMES, SURAH_AYAH_COUNTS_TANZIL, surahName } from "../surah-names";

// تحقّقٌ دائمٌ من مصدر أسماء السور (Tanzil): البنية، وتطابق أعداد الآيات مع المشروع،
// وتطابق الأسماء الـ٥٧ الموقَّعة في hizb_boundaries.json بعد توحيد الهمزات والتشكيل.

// توحيد: إزالة التشكيل، وطيّ همزات الألف (أ إ آ ا) وهمزة السطر إلى ألفٍ عارية.
const fold = (s: string) =>
  s.normalize("NFC").replace(/[ً-ْٰ]/g, "").replace(/[أإآءئؤ]/g, "ا").replace(/\s+/g, " ").trim();

describe("مصدر أسماء السور (Tanzil)", () => {
  it("١١٥ مدخلًا: حشوٌ في ٠ ثمّ ١..١١٤", () => {
    expect(SURAH_NAMES.length).toBe(115);
    expect(SURAH_NAMES[0]).toBe("");
    for (let s = 1; s <= 114; s++) expect(SURAH_NAMES[s].length).toBeGreaterThan(0);
  });

  it("أعداد آيات Tanzil تطابق SURAH_AYAH_COUNTS للسور الـ١١٤ كلّها", () => {
    expect(SURAH_AYAH_COUNTS_TANZIL.length).toBe(115);
    for (let s = 1; s <= 114; s++) expect(SURAH_AYAH_COUNTS_TANZIL[s]).toBe(SURAH_AYAH_COUNTS[s]);
  });

  it("الأسماء الـ٥٧ الموقَّعة تطابق القائمة (بعد توحيد الهمزات والتشكيل)", () => {
    const hizb: Array<{ startSurahNum: number; startSurah: string; endSurahNum: number; endSurah: string }> = JSON.parse(
      readFileSync(join(process.cwd(), "hizb_boundaries.json"), "utf8"),
    );
    const signed = new Map<number, string>();
    for (const h of hizb) {
      signed.set(h.startSurahNum, h.startSurah);
      signed.set(h.endSurahNum, h.endSurah);
    }
    expect(signed.size).toBe(57);
    for (const [num, name] of signed) expect(fold(surahName(num))).toBe(fold(name));
  });
});
