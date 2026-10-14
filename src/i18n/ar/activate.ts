// قاموس نصوص صفحة التفعيل (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في /activate.
// يُستدعى بمفتاحٍ عبر tActivate، تمهيداً لإضافة الإنجليزيّة والروسيّة لاحقاً (قواميس موازية بالمفاتيح نفسها).

export const activateAr = {
  // عناوين البطاقة بحسب الغرض
  titleReset: "إعادة تعيين كلمة السرّ",
  titleActivate: "تفعيل الحساب",

  // حالات المسار
  checking: "جارٍ التحقّق…",

  // رسائل التحقّق من الرابط
  noToken: "لا رمز في الرابط.",
  invalidLink: "رابطٌ غير صالح.",

  // تمام الضبط
  doneMsg: "تمّ ضبط كلمة السرّ. يمكنك الدخول الآن.",
  goLogin: "الذهاب للدخول",

  // المرحلة الجاهزة
  readyHint: "اختر كلمة سرٍّ جديدة (ثمانية أحرفٍ فأكثر).",
  fieldPassword: "كلمة السرّ",
  fieldPasswordConfirm: "تأكيد كلمة السرّ",
  saveAndLogin: "حفظ والدخول",

  // رسائل التحقّق من المدخلات والحفظ
  errPasswordShort: "كلمة السرّ ثمانية أحرفٍ فأكثر.",
  errPasswordMismatch: "كلمتا السرّ غير متطابقتين.",
  errSave: "تعذّر ضبط كلمة السرّ.",
} as const;

export type ActivateKey = keyof typeof activateAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس صفحة التفعيل. */
export function tActivate(key: ActivateKey): string {
  return activateAr[key];
}
