// قاموس نصوص شاشة الحصاد (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في الشاشة.
// يُستدعى بمفتاحٍ عبر tHasad، تمهيداً لإضافة لغاتٍ أخرى لاحقاً (قواميس موازية بالمفاتيح نفسها).
// لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.

export const hasadAr = {
  // المراتب (RANK)
  rankExcellent: "تميّز",
  rankPass: "اجتياز",
  rankFail: "رسوب",

  // أنواع الخطأ (ETYPE)
  etypeWord: "كلمة",
  etypeLetter: "حرف",
  etypeForgottenAyah: "نسيان آية",

  // فتات الطريق والعنوان
  crumbHome: "الرئيسة",
  crumbHasad: "الحصاد",
  pageTitle: "الحصاد",

  // رسائل الخطأ
  errLoadFace: "تعذّر تحميل الوجه.",
  errLoadHizbFaces: "تعذّر تحميل أوجه الحزب.",
  errSubmit: "تعذّر تسجيل الحصاد.",

  // حالة عدم الدخول
  unauthNeedLogin: "تحتاج دخولًا كمُسمِّع.",
  loginLink: "دخول",

  // حالات التحميل والخطأ
  loading: "…جارٍ التحميل",
  loadFailed: "تعذّر التحميل.",
  retry: "إعادة",

  // النتيجة النهائية
  rankLabel: "المرتبة:",
  totalErrors: "مجموع الأخطاء:",
  newHasad: "حصادٌ جديد",

  // اختيار الطالب
  noReady: "لا طلاب جاهزين للحصاد الآن",
  hizbPrefixDot: " · الحزب ",
  start: "ابدأ",

  // شاشة الحصاد
  hizbPrefixDotShort: " · حزب ",
  faceWord: "الوجه",
  ofWord: "من",
  pageParenPrefix: " (ص",
  hizbErrors: "أخطاء الحزب:",
  faceHesitation: "تردّد الوجه:",
  countsAsError: " (=خطأ)",
  errorTypeThenAyah: "نوع الخطأ ثمّ الآية:",
  faceAlt: "وجه",
  loadingFace: "…تحميل الوجه",
  errorBtn: "خطأ",
  hesitationBtn: "تردّد",
  nextFace: "الوجه التالي ⟵",
  finishHasad: "إنهاء الحصاد",
  cancelHasad: "إلغاء الحصاد",
  cancel: "إلغاء",
} as const;

/** مفاتيح قاموس الحصاد (للتحقّق الثابت عند الاستدعاء). */
export type HasadKey = keyof typeof hasadAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس الحصاد. */
export function tHasad(key: HasadKey): string {
  return hasadAr[key];
}
