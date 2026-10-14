// قاموس نصوص شاشة اختبار المرحلة (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في الشاشة.
// يُستدعى بمفتاحٍ عبر tStageExam، تمهيداً لإضافة لغاتٍ أخرى لاحقاً (قواميس موازية بالمفاتيح نفسها).
// لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.

export const stageExamAr = {
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
  crumbStageExam: "اختبار المرحلة",
  pageTitle: "اختبار المرحلة",

  // رسائل الخطأ
  errLoadFace: "تعذّر تحميل الوجه.",
  errLoadHizbFaces: "تعذّر تحميل أوجه الحزب.",
  errDefer: "تعذّر التأجيل.",
  errSubmit: "تعذّر تسجيل الاختبار.",

  // حالة عدم الدخول
  unauthNeedLogin: "تحتاج دخولًا كمختبِرٍ أو معلّم.",
  loginLink: "دخول",

  // حالات التحميل والخطأ
  loading: "…جارٍ التحميل",
  loadFailed: "تعذّر التحميل.",
  retry: "إعادة",

  // النتيجة النهائية
  examResult: "نتيجة الاختبار:",
  resultPassed: "ناجح",
  resultFailed: "راسب",
  rankLabel: "المرتبة:",
  transferProposalCreated: "أُنشئ اقتراح انتقالٍ معلَّق — بانتظار اعتماد المدير.",
  newExam: "اختبارٌ جديد",

  // القائمة (الجاهزون + في الإجازة)
  readyTitle: "الجاهزون لاختبار المرحلة",
  noReady: "لا طلاب جاهزين لاختبار المرحلة الآن",
  hizbUnit: "حزبًا",
  startExam: "ابدأ الاختبار",
  onLeaveTitle: "طلابٌ في إجازة المرحلة",
  leaveEnds: "الإجازة تنتهي",
  teacherDeferred: " · أجّلها المعلّم",
  adminDeferralsPrefix: " · تأجيلات إدارة: ",
  deferWeek: "تأجيل أسبوعًا",
  repeatedDeferByAdmin: "التأجيل المتكرّر بيد الإدارة",

  // شاشة الاختبار (حزب←حزب)
  nextFace: "الوجه التالي ⟵",
  nextHizb: "الحزب التالي ⟵",
  finishExam: "إنهاء الاختبار",
  overall: "الإجمالي:",
  hizbWord: "الحزب",
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
  cancelExam: "إلغاء الاختبار",
  cancel: "إلغاء",
} as const;

/** مفاتيح قاموس اختبار المرحلة (للتحقّق الثابت عند الاستدعاء). */
export type StageExamKey = keyof typeof stageExamAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس اختبار المرحلة. */
export function tStageExam(key: StageExamKey): string {
  return stageExamAr[key];
}
