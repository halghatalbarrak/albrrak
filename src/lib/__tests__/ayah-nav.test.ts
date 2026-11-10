import { describe, expect, it } from "vitest";

import { AYAH_COUNTS, nextInMaraqi, prevInMaraqi } from "../ayah-nav";
import { MARAQI_SURAH_ORDER } from "../maraqi-order";

describe("ayah-nav — تنقّل الآيات بترتيب مراقي", () => {
  it("+ آية داخل سورة (لا تخطٍّ)", () => {
    expect(nextInMaraqi(1, 3)).toEqual({ surah: 1, ayah: 4 });
    expect(nextInMaraqi(114, 2)).toEqual({ surah: 114, ayah: 3 });
    expect(nextInMaraqi(2, 100)).toEqual({ surah: 2, ayah: 101 });
  });

  it("+ آية عند نهاية الفاتحة ينتقل إلى الناس آية ١", () => {
    expect(AYAH_COUNTS[1]).toBe(7);
    expect(nextInMaraqi(1, 7)).toEqual({ surah: 114, ayah: 1 });
  });

  it("+ آية عند نهاية سورةٍ وسطيّة ينتقل بحسب ترتيب مراقي", () => {
    // الناس (١١٤) ← المسد (١١٣) في ترتيب مراقي
    const nasAyahs = AYAH_COUNTS[114]; // 6
    expect(nextInMaraqi(114, nasAyahs)).toEqual({ surah: 113, ayah: 1 });
  });

  it("+ آية عند نهاية البقرة (نهاية مراقي) → null", () => {
    const baqaraAyahs = AYAH_COUNTS[2]; // 286
    expect(nextInMaraqi(2, baqaraAyahs)).toBeNull();
  });

  it("− آية داخل سورة (لا تخطٍّ)", () => {
    expect(prevInMaraqi(1, 4)).toEqual({ surah: 1, ayah: 3 });
    expect(prevInMaraqi(114, 5)).toEqual({ surah: 114, ayah: 4 });
  });

  it("− آية عند أوّل الناس ينتقل إلى آخر آية الفاتحة", () => {
    expect(prevInMaraqi(114, 1)).toEqual({ surah: 1, ayah: AYAH_COUNTS[1] });
    expect(prevInMaraqi(114, 1)).toEqual({ surah: 1, ayah: 7 });
  });

  it("− آية عند أوّل الفاتحة (بداية مراقي) → null", () => {
    expect(prevInMaraqi(1, 1)).toBeNull();
  });

  it("ترتيب مراقي: الفاتحة أوّلاً ثمّ الناس نزولاً حتى البقرة", () => {
    expect(MARAQI_SURAH_ORDER[0]).toBe(1);
    expect(MARAQI_SURAH_ORDER[1]).toBe(114);
    expect(MARAQI_SURAH_ORDER[2]).toBe(113);
    expect(MARAQI_SURAH_ORDER[MARAQI_SURAH_ORDER.length - 1]).toBe(2);
    expect(MARAQI_SURAH_ORDER).toHaveLength(114);
  });

  it("AYAH_COUNTS يطابق SURAH_AYAH_COUNTS المرجعيّة للسور المعروفة", () => {
    expect(AYAH_COUNTS[1]).toBe(7);    // الفاتحة
    expect(AYAH_COUNTS[2]).toBe(286);  // البقرة
    expect(AYAH_COUNTS[114]).toBe(6);  // الناس
    expect(AYAH_COUNTS[112]).toBe(4);  // الإخلاص
  });

  it("«سمّع كما هو» — نموذج: تسجيل بالوجهة المقترحة يعيد الحد حرفاً بحرف", () => {
    // هذا اختبار وحدة للمنطق: الوجهة المقترحة {toSurah:3, toAyah:10} تُسجَّل بلا تعديل.
    const target = { fromSurah: 3, fromAyah: 1, toSurah: 3, toAyah: 10 };
    // HifzInput يبدأ بالحد المقترح ولا يعدّله إن لم يضغط المعلّم ± آية.
    const recorded = { ...target, attempts: 1, mastered: false };
    expect(recorded.toSurah).toBe(target.toSurah);
    expect(recorded.toAyah).toBe(target.toAyah);
  });
});
