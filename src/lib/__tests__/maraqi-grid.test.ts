import { describe, expect, it } from "vitest";

import { gridToPlacement } from "../maraqi-grid";

// البند ٧: ترجمة الشبكة البصريّة ⟵ MaraqiPlacement. المحور: مثال أحمد يعطي بيانات الإدخال
// اليدويّ نفسها، وأنّ الشبكة والإدخال اليدويّ (منتقي الوصول + السور) مكافئان تمامًا.

describe("gridToPlacement", () => {
  it("مثال أحمد: الجزءان ٣٠ و٢٩ + الحشر + البقرة", () => {
    const fromGrid = gridToPlacement({
      fullyMemorizedJuz: [30, 29],
      singleSurahs: [59, 2], // الحشر، البقرة
      preciseRanges: [],
    });
    // الجبهة تبلغ آخر الجزء ٢٩ (الملك ٦٧: آخر آيةٍ ٣٠)، والحشر والبقرة خارج الترتيب.
    expect(fromGrid).toEqual({
      reachedSurah: 67,
      reachedAyah: 30,
      outOfOrder: [
        { fromSurah: 59, fromAyah: 1, toSurah: 59, toAyah: 24 },
        { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 286 },
      ],
    });
  });

  it("الشبكة والإدخال اليدويّ (منتقي الوصول ٦٧:٣٠) مكافئان تمامًا", () => {
    const fromGrid = gridToPlacement({ fullyMemorizedJuz: [30, 29], singleSurahs: [59, 2], preciseRanges: [] });
    const manual = gridToPlacement({
      fullyMemorizedJuz: [],
      reachedSurah: 67,
      reachedAyah: 30,
      singleSurahs: [59, 2],
      preciseRanges: [],
    });
    expect(manual).toEqual(fromGrid);
  });

  it("جزءٌ واحدٌ (٣٠) ⟵ الجبهة عند السورة ٧٨ آخر آية، بلا خارج ترتيب", () => {
    expect(gridToPlacement({ fullyMemorizedJuz: [30], singleSurahs: [], preciseRanges: [] })).toEqual({
      reachedSurah: 78,
      reachedAyah: 40,
      outOfOrder: [],
    });
  });

  it("لا شيء ⟵ لا جبهة ولا خارج ترتيب", () => {
    expect(gridToPlacement({ fullyMemorizedJuz: [], singleSurahs: [], preciseRanges: [] })).toEqual({
      reachedSurah: null,
      reachedAyah: null,
      outOfOrder: [],
    });
  });

  it("سورةٌ مفردةٌ بعيدةٌ بلا جبهة ⟵ نطاقٌ خارج ترتيب فقط", () => {
    expect(gridToPlacement({ fullyMemorizedJuz: [], singleSurahs: [2], preciseRanges: [] })).toEqual({
      reachedSurah: null,
      reachedAyah: null,
      outOfOrder: [{ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 286 }],
    });
  });
});
