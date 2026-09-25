import { describe, expect, it } from "vitest";

import { gridToPlacement, currentJuzSurahs } from "../maraqi-grid";

// البند ٧: ترجمة الشبكة البصريّة ⟵ MaraqiPlacement. مثال أحمد بالتفسير الصحيح: وصل في الجزء
// ٢٨ إلى الحشر (٥٩) — أي محفوظٌ من التحريم (٦٦) نزولاً حتى الحشر — والبقرة خارج الترتيب.
// القيمة المتوقَّعة مكتوبةٌ صراحةً (لا تكافؤ الشبكة والإدخال اليدويّ وحده)، وتطابق ما يرمّزه
// اختبار المهمّة ٦ (program-placement-m2): reachedSurah=59، reachedAyah=24، outOfOrder=[البقرة].

describe("gridToPlacement", () => {
  it("مثال أحمد: الجزءان ٣٠ و٢٩ كاملان + الوصول إلى الحشر في الجزء ٢٨ + البقرة خارج الترتيب", () => {
    const ahmad = gridToPlacement({
      fullyMemorizedJuz: [30, 29],
      reachedSurah: 59, // الحشر — موضع الوصول في الجزء الجاري (٢٨)
      reachedAyah: 24, // آخر الحشر
      singleSurahs: [2], // البقرة، خارج الترتيب
      preciseRanges: [],
    });
    expect(ahmad).toEqual({
      reachedSurah: 59,
      reachedAyah: 24,
      outOfOrder: [{ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 286 }],
    });
  });

  it("سور الجزء الجاري المحفوظة عند الوصول إلى الحشر: التحريم نزولاً حتى الحشر", () => {
    // الجزء ٢٨ = المجادلة(٥٨)‥التحريم(٦٦)؛ بترتيب مراقي من ٦٦ نزولاً حتى ٥٩.
    expect(currentJuzSurahs(59, 24)).toEqual([66, 65, 64, 63, 62, 61, 60, 59]);
  });

  it("الشبكة والإدخال اليدويّ مكافئان (إضافةً): الأجزاء الكاملة لا تغيّر الجبهة ولا الخارج", () => {
    const withGrid = gridToPlacement({ fullyMemorizedJuz: [30, 29], reachedSurah: 59, reachedAyah: 24, singleSurahs: [2], preciseRanges: [] });
    const manualOnly = gridToPlacement({ fullyMemorizedJuz: [], reachedSurah: 59, reachedAyah: 24, singleSurahs: [2], preciseRanges: [] });
    expect(manualOnly).toEqual(withGrid);
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
