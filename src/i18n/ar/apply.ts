// قاموس نصوص صفحة القيد (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في /apply.
// يُستدعى بمفتاحٍ عبر tApply، تمهيداً لإضافة الإنجليزيّة والروسيّة لاحقاً (قواميس موازية بالمفاتيح نفسها).

export const applyAr = {
  // اسم المنصّة (aria-label و alt للشعار)
  brand: "حلقات الشيخ محمد البراك",

  // حالات التحميل والخطأ
  loading: "جارٍ التحميل…",
  loadErrorTitle: "تعذّر تحميل النموذج",
  loadErrorBody: "حدث خطأ أثناء جلب البيانات. حاول مرة أخرى.",
  retry: "إعادة المحاولة",

  // تمام الاستلام
  okTitle: "تمّ استلام طلب القيد",
  okBody: "سيُنظر فيه ويُبلَّغ وليّ الأمر بالنتيجة إن شاء الله.",

  // عنوان النموذج ومقدّمته
  formTitle: "نموذج القيد",
  step1Lead: "حلقات الشيخ محمد البراك — تُملأ بلا حساب.",

  // الخطوة ١: تاريخ الميلاد
  fieldBirthDate: "تاريخ الميلاد (ميلادي)",
  next: "التالي",

  // الخطوة ٢: خطاب العمر
  childLead: "هذا الطالب دون الثالثة عشرة. على ولي الأمر تعبئة البيانات.",
  adultLead: "الطالب هو من يعبّئ بياناته.",
  editBirthDate: "← تعديل تاريخ الميلاد",

  // نقص الجنسيات
  noNationalities: "قوائم الجنسيات غير متاحة حاليًا — تعذّر إتمام النموذج. أبلغ الإدارة.",

  // عناوين الحقول
  fieldNameAsInId: "الاسم كما في الهوية",
  fieldNationalId: "رقم الهوية",
  fieldNationality: "الجنسية (اكتب للبحث)",
  fieldGender: "الجنس",
  fieldSchoolStage: "المرحلة الدراسية",
  fieldGuardianPhone: "جوال ولي الأمر (يبدأ بـ 966)",
  fieldGuardianEmail: "بريد ولي الأمر (اختياريّ — لتصله تقارير الأسبوع)",
  fieldGuardianGender: "جنس ولي الأمر",
  fieldGuardianRelation: "صفة ولي الأمر",
  fieldPriorHifz: "مقدار الحفظ (بالأجزاء)",

  // جوال الطالب (توليف: جزءٌ ثابت + حالة)
  fieldStudentPhone: "جوال الطالب",
  studentPhoneRequired: "(إلزامي — شرط حسابه)",
  studentPhoneOptional: "(اختياري)",

  // خيارات الجنس
  genderMale: "ذكر",
  genderFemale: "أنثى",

  // خيار فارغ وخيار الاختيار
  optionDash: "—",
  optionChoose: "اختر…",

  // جهة اتصال الطوارئ
  emergencyLegend: "جهة اتصال الطوارئ — حين لا يردّ ولي الأمر",
  emergencyName: "الاسم",
  emergencyPhone: "الجوال (يخالف جوال ولي الأمر)",
  emergencyRelation: "الصفة",

  // زرّ الإرسال
  sending: "جارٍ الإرسال…",
  submit: "إرسال طلب القيد",

  // رسائل التحقّق والخطأ المعروضة
  errSelectNationality: "اختر الجنسية من القائمة.",
  errSendApplication: "تعذّر إرسال الطلب.",
  errConnect: "تعذّر الاتصال بالخادم.",
} as const;

export type ApplyKey = keyof typeof applyAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس صفحة القيد. */
export function tApply(key: ApplyKey): string {
  return applyAr[key];
}
