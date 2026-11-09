// قاموس نصوص الصفحة الرئيسة (العربيّة). الاتّجاه RTL.

export const homeAr = {
  // واجهة الزائر
  applyBtn: "تقديم طلب",
  loginBtn: "دخول",
  loginPrompt: "سجّل الدخول لعرض لوحتك.",
  greetingPrefix: "مرحبًا، ",

  // شاشة إعادة التوجيه إلى المدّكر
  muddakirRedirect: "…جارٍ التحويل إلى المدّكر",

  // شريط الخطوة التالية
  nextStepLabel: "الخطوة التالية",
} as const;

export type HomeKey = keyof typeof homeAr;
export function tHome(key: HomeKey): string {
  return homeAr[key];
}
