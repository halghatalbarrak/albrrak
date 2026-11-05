// قاموس نصوص مراقي (العربيّة) — المصدر الوحيد لنصوص وجهة اليوم التي تظهر للمعلّم والطالب.
// يُستدعى بمفتاحٍ عبر tMaraqi (تمهيدًا لقواميس موازية بلغاتٍ أخرى بالمفاتيح نفسها).

export const maraqiAr = {
  // إتمام المسار (مراقي ٢): الحافظ أنهى آخر وحدةٍ في مساره.
  trackCompletedTeacher: "أتمّ المسار — انقله إلى المسار التالي",
  trackCompletedStudent: "أتممتَ محفوظ مسارك — بارك الله فيك 🎉",
  noTrackYet: "لم يُحدَّد المسار بعد (اختبار الوتيرة)",
  // وجهة اليوم (م٤): الحالات والمصطلحات الثلاثة (احفظ · رسّخ · راجِع).
  onLeaveNoTarget: "في إجازة اختبار المرحلة — لا وجهةَ اليوم.",
  noTargetToday: "لا وجهةَ اليوم.",
  memorize: "احفظ",
  repeatYesterdayPrefix: "أعِد مقطع أمس (لم يُتقن): ",
  consolidate: "رسّخ",
  noConsolidationYet: "لا ترسيخَ بعد",
  lastUnitsPrefix: "آخر ",
  lastUnitsSuffix: " وحدة: ",
  review: "راجِع",
  noReviewTodayHoliday: "لا مراجعةَ اليوم (عطلة)",
  noConsolidatedForReview: "لا راسخَ للمراجعة بعد",
  todaySharePrefix: "حصّة اليوم (الأضعف أوّلاً): ",
} as const;

export type MaraqiKey = keyof typeof maraqiAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس مراقي. */
export function tMaraqi(key: MaraqiKey): string {
  return maraqiAr[key];
}
