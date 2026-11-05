// قاموس نصوص شاشة الجَنْي (البائع/نقطة البيع) — العربيّة. يُستدعى عبر tSell. النصّ منقولٌ حرفيّاً.

export const sellAr = {
  scanHint: "امسح رمز الحاصد بالكاميرا، أو أدخِل رقمه الاحتياطيّ.",
  scanWithCamera: "امسح بالكاميرا",
  stopCamera: "إيقاف الكاميرا",
  search: "بحث",
  student: "الطالب",
  cancelOtherStudent: "إلغاء / طالبٌ آخر",
  chooseFruit: "اختر الثمرة",
  insufficientBalance: "الرصيد لا يكفي",
  noFruitsNow: "لا ثمار متاحة الآن.",
} as const;

export type SellKey = keyof typeof sellAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس شاشة الجَنْي. */
export function tSell(key: SellKey): string {
  return sellAr[key];
}
