// قاموس نصوص تثبيت التطبيق (PWA) — العربيّة. يُستدعى عبر tPwa.

export const pwaAr = {
  install: "تثبيت التطبيق",
  dismiss: "لاحقًا",
  iosTitle: "لتثبيت التطبيق على آيفون:",
  iosStep1: "اضغط زرّ المشاركة في المتصفّح.",
  iosStep2: "اختر «إضافة إلى الشاشة الرئيسية».",
  iosClose: "حسنًا",
} as const;

export type PwaKey = keyof typeof pwaAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس التثبيت. */
export function tPwa(key: PwaKey): string {
  return pwaAr[key];
}
