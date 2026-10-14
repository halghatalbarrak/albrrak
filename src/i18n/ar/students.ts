// قاموس نصوص شاشات الطلاب (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في
// شاشات admin/students (القائمة، التسكين، خريطة الضعف). يُستدعى بمفتاحٍ عبر tStudents،
// تمهيداً لإضافة لغاتٍ موازية لاحقاً (بالمفاتيح نفسها).
// النصوص منقولةٌ حرفاً بحرف من الصفحات بلا تغييرٍ في الصياغة أو المسافات أو التشكيل.
// لا تُنقل هنا: القرآن، أسماء السور، بيانات الخادم، console.*، الأرقام.

export const studentsAr = {
  // ===== القائمة (page.tsx) =====
  // حالات الطالب (STATE_AR) — ترجمة عرضٍ لرموز الخادم
  stateApplied: "مُقدَّم",
  statePendingAcceptance: "بانتظار القبول",
  stateWaitlisted: "قائمة الانتظار",
  stateRejected: "مرفوض",
  stateAwaitingReadingTest: "بانتظار اختبار القراءة",
  stateInQaidah: "في القاعدة المدنية",
  stateAwaitingPaceTest: "بانتظار اختبار المقطع",
  statePaceRetestScheduled: "إعادة اختبار المقطع",
  stateInMaraqi: "في المراقي",
  stateCompleted: "أتمّ",
  stateWithdrawn: "منسحب",

  // نموذج اختبار القراءة
  readingTestFailed: "تعذّر تسجيل الاختبار.",
  readsFluently: "يجيد القراءة نظراً",
  toPaceTest: "← بانتظار اختبار المقطع",
  toQaidahCircle: "← القاعدة المدنية + حلقة",
  qaidahCircleLabel: "حلقة القاعدة المدنية",
  chooseEllipsis: "اختر…",
  examinerNotes: "ملاحظات المختبِر",
  submitForApproval: "رفع القرار للاعتماد",

  // جلب/أخطاء القائمة
  noPermissionStaff: "لا صلاحية — هذه الشاشة للكادر الإداري.",
  fetchStudentsFailed: "تعذّر جلب الطلاب.",
  connectFailed: "تعذّر الاتصال بالخادم.",
  revealIdFailed: "تعذّر كشف رقم الهوية.",
  rejectReasonPrompt: "سبب الرفض (إلزامي):",
  decideFailed: "تعذّر تنفيذ القرار.",

  // أعمدة الجدول والإجراءات
  colName: "الاسم",
  colState: "الحالة",
  colAge: "العمر",
  colCircle: "الحلقة",
  colGuardian: "ولي الأمر",
  colActions: "إجراءات",
  notAssigned: "لم تُسنَد",
  approve: "اعتمِد",
  reject: "ارفض",
  readingTest: "اختبار القراءة",
  weaknessMap: "الخريطة",
  placement: "تسكين",
  revealId: "كشف الهوية",
  idPrefix: "الهوية:", // لِـ«الهوية: ٠٠٠»

  // عناوين ومسار التنقّل
  acceptedStudents: "الطلاب المقبولون",
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbStudents: "الطلاب",
  noAcceptedStudents: "لا طلاب مقبولون بعد",
  pendingStudentsSuffix: " طالبٍ بانتظار اعتماد تحديدك — راجِعهم.", // يَسبقه عددٌ
  pendingDecisionsBadge: "قرارات تحديدٍ معلّقة",
  readingTestModalPrefix: "اختبار القراءة — ", // يَعقبه اسم الطالب

  // ===== التسكين (placement/page.tsx) =====
  // أسباب تاريخ البرامج (REASON_AR)
  reasonAssignment: "إسناد أوّليّ",
  reasonReadingTest: "اختبار قراءة",
  reasonGraduation: "تخرّج",
  reasonChange: "تغيير إداريّ",
  // أسماء البرامج (PROG_AR)
  progQaidah: "القاعدة المدنية",
  progMaraqi: "مراقي",
  progWeekly: "الأسبوعيّ",

  // جلب/رسائل التسكين
  placementNoPermission: "لا صلاحية — التسكين للمشرف/المدير (ق٧).",
  fetchPlacementFailed: "تعذّر جلب بيانات التسكين.",
  executeFailed: "تعذّر التنفيذ.",
  loading: "جارٍ التحميل…",
  programChanged: "تغيّر البرنامج.",
  placedOnQaidah: "سُكِّن على القاعدة.",
  placedOnMaraqi: "سُكِّن على مراقي.",

  // مسار التنقّل — التسكين
  placementTitlePrefix: "تسكين: ", // يَعقبه اسم الطالب
  crumbPlacement: "تسكين",

  // تاريخ البرامج
  colProgram: "البرنامج",
  colIn: "دخل",
  colOut: "خرج",
  stillActive: "— (نشط)",
  colReason: "السبب",
  colActor: "الفاعل",
  systemActor: "النظام",
  programHistoryTitle: "تاريخ البرامج",

  // تغيير البرنامج
  programTitle: "البرنامج",
  noProgram: "بلا برنامج",
  movesToPrefix: "ينتقل إلى ", // ينتقل إلى <اسم> في <تاريخ>
  movesToIn: " في ",
  changeProgram: "تغيير البرنامج",
  changeCancelsPending: "تغيير البرنامج الآن يُلغي الانتقال المعلّق.",

  // تسكين القاعدة
  qaidahPlacementTitle: "تسكين القاعدة — الدرس الحاليّ",
  currentLessonLabel: "الدرس الحاليّ للطالب",
  lessonsBeforePrefix: "ستُكمَّل ",
  lessonsBeforeSuffix: " درسًا قبله (تسكينًا، بلا نقاط)، ويبدأ من هذا الدرس.",
  savePlacement: "حفظ التسكين",

  // تسكين مراقي
  maraqiPlacementTitle: "تسكين مراقي — تأشير المحفوظ",
  fullyMemorizedJuz: "الأجزاء المحفوظة كاملةً",
  juzWord: "جزء", // «جزء ١»
  reachedPointLabel: "موضع الوصول في الجزء الجاري (اسم السورة ثمّ الآية)",
  reachedPointNote: "محفوظٌ من أوّل الجزء بترتيب مراقي (السور تنازليّاً) حتى هذا الموضع.",
  chooseSurah: "— اختر السورة —",
  ayahPlaceholder: "آية",
  clear: "مسح",
  singleSurahsTitle: "سورٌ مفردة خارج الترتيب (بأسمائها)",
  surahSearchPlaceholder: "ابحث باسم السورة…",
  preciseRangesToggle: "نطاقاتٌ دقيقة (متقدّم)",
  delete: "حذف",
  rangeFrom: "من",
  surahPlaceholder: "سورة",
  rangeTo: "إلى",
  addRange: "+ نطاق",
  previewReachedLabel: "الجبهة المسكَّنة (محفوظٌ بالترتيب حتى): ",
  previewNone: "—",
  previewCurrentJuzLabel: "محفوظٌ من الجزء الجاري: ",
  previewOutOfOrderLabel: "خارج الترتيب: ",
  previewOutOfOrderNone: "لا شيء",
  previewFootnote: "الحفظ الجديد يبدأ بعد الجبهة ويتخطّى المحفوظ خارج الترتيب. الحدود الدقيقة تُحسب عند الحفظ من وحدات المسار.",

  // ===== خريطة الضعف (weakness/page.tsx) =====
  weaknessNoPermission: "لا صلاحية — لا تَرى إلا خرائط طلابك.",
  fetchMapFailed: "تعذّر جلب الخريطة.",
  weaknessMapTitlePrefix: "خريطة الضعف", // يَعقبه « — <اسم>»
  crumbWeaknessMap: "الخريطة",
  noErrorsYet: "لا مواضع خطأٍ مسجّلة بعد",
  noErrorsYetDesc: "تظهر الخريطة بعد حصادٍ تُرصد فيه أخطاءٌ عند الآيات.",
  totalErrorsPrefix: "مجموع الأخطاء المسجَّلة: ",
  totalErrorsMid: " على ",
  totalErrorsSuffix: " وجهًا.",
  heatHint: "كلّما اشتدّ البرونزيّ كثُر الخطأ.",
  mostErrorsTitle: "أكثر المواضع خطأً",
  surahWord: "سورة", // «سورة ٢ · آية ٥»
  ayahWord: "آية",
  onceWord: "مرّة",
  manyTimesWord: "مرّات",
  facesTitle: "الأوجه",
  facePagePrefix: "وجه ص", // «وجه ص٥ · ٣ موضعًا»
  positionsSuffix: "موضعًا",
} as const;

/** مفاتيح قاموس شاشات الطلاب (للتحقّق الثابت عند الاستدعاء). */
export type StudentsKey = keyof typeof studentsAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس شاشات الطلاب. */
export function tStudents(key: StudentsKey): string {
  return studentsAr[key];
}
