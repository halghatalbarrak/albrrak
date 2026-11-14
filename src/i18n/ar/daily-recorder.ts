// قاموس نصوص مكوّن التسجيل اليومي المشترَك (HifzInput + ConsolidationInput).
// يُستدعى عبر tDailyRecorder. لا نصوص عربية مباشرة في JSX (قاعدة jsx:0).

export const dailyRecorderAr = {
  // الحفظ الجديد — أزرار الفعل الرئيسيّة
  sayAsIs: "سمّع كما هو",
  masteredToggle: "أتقن",
  notMasteredToggle: "لم يُتقن",
  // تعديل النهاية
  minusAyah: "−آية",
  plusAyah: "+آية",
  surahLabel: "السورة",
  surahSearch: "ابحث باسم السورة…",
  endLabel: "النهاية:",
  targetLabel: "وجهة اليوم:",
  // المحاولات
  attemptsLabel: "المحاولات:",
  // تنبيه الحكم ١
  repeatWarning: "الحكم ١: يعيد مقطع أمس.",
  hifzGateWarning: "⚠️ الحكم ١: يعيد نفس المقطع",
  hifzGateRangeOpen: " (",
  hifzGateSuffix: ")، لا حفظ جديد.",
  // الترسيخ
  tarseekhDoneAsIs: "تمّ كما هو المطلوب",
  tarseekhNotDone: "لم يتمّ",
  // المراجعة
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
} as const;

export type DailyRecorderKey = keyof typeof dailyRecorderAr;

export function tDailyRecorder(key: DailyRecorderKey): string {
  return dailyRecorderAr[key];
}
