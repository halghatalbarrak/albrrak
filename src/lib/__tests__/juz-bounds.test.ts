import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { JUZ_BOUNDS } from "../juz-bounds";

// تحقّقٌ دائم: JUZ_BOUNDS مشتقٌّ حرفيّاً من hizb_boundaries.json الموقَّع (لا تحريرٌ يدويّ).

interface Hizb { hizb: number; juz: number; startSurahNum: number; startAyah: number; endSurahNum: number; endAyah: number }

describe("JUZ_BOUNDS", () => {
  it("٣٠ جزءًا مشتقّةً من المصدر الموقَّع", () => {
    const hizb: Hizb[] = JSON.parse(readFileSync(join(process.cwd(), "hizb_boundaries.json"), "utf8"));
    const byJuz = new Map<number, Hizb[]>();
    for (const h of hizb) byJuz.set(h.juz, [...(byJuz.get(h.juz) ?? []), h]);
    const derived = [...byJuz.values()]
      .map((hs) => hs.slice().sort((a, b) => a.hizb - b.hizb))
      .map((hs) => ({ juz: hs[0].juz, startSurah: hs[0].startSurahNum, startAyah: hs[0].startAyah, endSurah: hs[hs.length - 1].endSurahNum, endAyah: hs[hs.length - 1].endAyah }))
      .sort((a, b) => a.juz - b.juz);

    expect(derived.length).toBe(30);
    expect(JUZ_BOUNDS.map((j) => ({ ...j }))).toEqual(derived);
  });
});
