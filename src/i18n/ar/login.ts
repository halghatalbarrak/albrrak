// قاموس نصوص صفحة الدخول (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في /login.
// يُستدعى بمفتاحٍ عبر tLogin، تمهيداً لإضافة الإنجليزيّة والروسيّة لاحقاً (قواميس موازية بالمفاتيح نفسها).

export const loginAr = {
  // اسم المنصّة (aria-label و alt للشعار)
  brand: "حلقات الشيخ محمد البراك",

  // عنوان البطاقة
  title: "تسجيل الدخول",

  // عناوين الحقول
  fieldPhone: "الجوال",
  fieldPassword: "كلمة السر",

  // زرّ الدخول
  submitting: "جارٍ الدخول…",
  submit: "دخول",

  // رابط التقديم
  applyLink: "ليس لديك حساب؟ تقديم طلب قيد",

  // رسائل الخطأ المعروضة
  errSignIn: "تعذّر الدخول — تحقّق من الجوال وكلمة السر.",
  errConnect: "تعذّر الاتصال بخادم الدخول.",
} as const;

export type LoginKey = keyof typeof loginAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس صفحة الدخول. */
export function tLogin(key: LoginKey): string {
  return loginAr[key];
}
