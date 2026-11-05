// قاموس نصوص شاشة «استيراد الطلاب» (الإدارة) — العربيّة. المصدر الوحيد لكل نصٍّ يظهر
// في /admin/students/import. يُستدعى بمفتاحٍ عبر tStudentImport. لا تُكتب الأرقام هنا؛
// العرض الرقميّ بـarNum في طبقة العرض.

export const studentImportAr = {
  // التنقّل
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbStudents: "الطلاب",
  crumbImport: "استيراد الطلاب",

  // العنوان والمقدّمة
  title: "استيراد الطلاب",
  intro: "ارفع ملفّ CSV بالأعمدة المحدّدة، اختر الحلقة، عايِن، ثم اعتمد. لا يُحفظ شيءٌ قبل الاعتماد.",

  // الصلاحية والتحميل
  errForbidden: "لا صلاحية — هذه الشاشة للمشرف العام.",
  errLoad: "تعذّر جلب البيانات.",
  errNoFile: "اختر ملفًّا أوّلًا.",
  errParse: "تعذّر تحليل الملفّ.",
  errMissingColumns: "أعمدةٌ ناقصةٌ في الترويسة:",
  errNoCircle: "اختر الحلقة أوّلًا.",
  errNoValidRows: "لا سطور صالحةٌ للاعتماد.",

  // اختيار البرنامج والحلقة
  fieldProgram: "البرنامج",
  fieldDefaultProgram: "البرنامج الافتراضيّ",
  selectProgram: "اختر برنامجًا…",
  fieldCircle: "الحلقة",
  selectCircle: "اختر حلقة…",
  noCircles: "لا حلقات.",

  // الملفّ والقالب
  fieldFile: "ملفّ CSV",
  downloadTemplate: "تنزيل القالب",
  templateHint: "القالب CSV بترميز UTF-8. الأعمدة الإلزاميّة بالترتيب نفسه.",

  // أزرار
  previewBtn: "معاينة",
  parsing: "جارٍ التحليل…",
  commitBtn: "اعتماد",
  committing: "جارٍ الحفظ…",

  // المعاينة
  previewTitle: "المعاينة",
  summaryValid: "صالح",
  summaryWarning: "تحذير",
  summaryError: "خطأ",
  summarySkip: "مُتخطّى",
  skipNoticePrefix: "سيُتخطّى",
  skipNoticeReason: "لأنهم مستوردون سابقًا",
  colRow: "السطر",
  colName: "الاسم",
  colId: "الهوية",
  colStatus: "الحالة",
  colReason: "الملاحظات",
  statusValid: "صالح",
  statusWarning: "تحذير",
  statusError: "خطأ",
  statusSkip: "مُتخطّى",
  fixPick: "اختر القيمة الصحيحة…",
  fixNationality: "تصحيح الجنسية",
  fixRelation: "تصحيح الصلة",

  // التقرير
  reportTitle: "تقرير الاستيراد",
  reportSuccess: "نجح",
  reportFail: "فشل",
  outcomeOk: "تمّ",
  outcomeFail: "فشل",

  // علل التحقّق (issue codes)
  issueIdNot10: "رقم الهوية ليس عشرة أرقام (مقبولٌ لجوازات السفر).",
  issueNationalityUnmatched: "الجنسية غير مطابقة — اخترها يدويًّا.",
  issueRelationUnmatched: "صلة ولي الأمر غير مطابقة — اخترها يدويًّا.",
  issueEmergencyRelationUnmatched: "صلة جهة الطوارئ غير مطابقة — اخترها يدويًّا.",
  issueMissingName: "اسم الطالب مطلوب.",
  issueMissingNationality: "الجنسية مطلوبة.",
  issueMissingBirthDate: "تاريخ الميلاد مطلوب.",
  issueBadBirthDate: "تاريخ الميلاد غير صالح.",
  issueMissingStudentGender: "جنس الطالب مطلوب.",
  issueBadStudentGender: "جنس الطالب غير مفهوم (ذكر/أنثى).",
  issueMissingGuardianGender: "جنس ولي الأمر مطلوب.",
  issueBadGuardianGender: "جنس ولي الأمر غير مفهوم (ذكر/أنثى).",
  issueMissingGuardianRelation: "صلة ولي الأمر مطلوبة.",
  issueMissingGuardianPhone: "جوال ولي الأمر مطلوب.",
  issueTeenNeedsPhone: "الطالب في الثالثة عشرة فأكثر يلزمه جوال.",
  issueProgramUnmatched: "البرنامج غير مطابق — سيُستعمل الافتراضيّ.",
  issueProgramMissing: "البرنامج مطلوب — اختر برنامجًا افتراضيًّا.",
  issueDupInFile: "رقم الهوية مكرّرٌ في الملفّ.",
  issueAlreadyStudent: "مستورَدٌ سابقًا (طالبٌ مقبول) — سيُتخطّى.",
  issueAlreadyPending: "له طلب قيدٍ معلّق — سيُتخطّى.",

  // أسباب فشل الحفظ (reason keys)
  reasonImportRowFailed: "تعذّر حفظ هذا السطر.",
  reasonRowInvalid: "السطر غير صالح.",
  reasonStudentAlreadyInThisCircle: "الطالب في هذه الحلقة مسبقًا.",
  reasonStudentThirteenNeedsPhone: "الطالب في الثالثة عشرة فأكثر يلزمه جوال.",
} as const;

export type StudentImportKey = keyof typeof studentImportAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس استيراد الطلاب. */
export function tStudentImport(key: StudentImportKey): string {
  return studentImportAr[key];
}
