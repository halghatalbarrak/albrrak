import { describe, expect, it } from "vitest";

import { dailyRecorderAr, tDailyRecorder } from "../ar/daily-recorder";

describe("قاموس المُسجِّل اليومي المشترَك (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tDailyRecorder("sayAsIs")).toBe("أتقن المقرّر ✓");
    expect(tDailyRecorder("tarseekhDoneAsIs")).toBe("تمّ كما هو المطلوب");
    expect(tDailyRecorder("murajaahDoneAsIs")).toBe("تمّت كما هو المطلوب");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof dailyRecorderAr, string> = {
      sayAsIs: "أتقن المقرّر ✓",
      sayAsIsHint: "يسجّل المقرّر المعروض؛ عدّل النهاية أولاً إن اختلف",
      masteredToggle: "أتقن",
      notMasteredToggle: "لم يُتقن",
      minusAyah: "−آية",
      plusAyah: "+آية",
      surahLabel: "السورة",
      surahSearch: "ابحث باسم السورة…",
      endLabel: "النهاية:",
      targetLabel: "وجهة اليوم:",
      attemptsLabel: "المحاولات:",
      repeatWarning: "الحكم ١: يعيد مقطع أمس.",
      hifzGateWarning: "⚠️ الحكم ١: يعيد نفس المقطع",
      hifzGateRangeOpen: " (",
      hifzGateSuffix: ")، لا حفظ جديد.",
      tarseekhDoneAsIs: "تمّ كما هو المطلوب",
      tarseekhNotDone: "لم يتمّ",
      murajaahDoneAsIs: "تمّت كما هو المطلوب",
      murajaahNotDone: "لم تتمّ",
      partial: "جزء منه",
      partialQuarter: "¼",
      partialHalf: "½",
      partialThreeQuarters: "¾",
      extra: "زيادة",
      extraUnits1: "+١",
      extraUnits2: "+٢",
      extraUnits3: "+٣",
      otherAmountLabel: "مقدار آخر",
      otherAmountPlaceholder: "عدد المقاطع",
      otherAmountSave: "رصد",
    };
    for (const key of Object.keys(expected) as (keyof typeof dailyRecorderAr)[]) {
      expect(tDailyRecorder(key)).toBe(expected[key]);
    }
    expect(Object.keys(dailyRecorderAr).length).toBe(Object.keys(expected).length);
  });
});
