// قاموس نصوص الشاشة الموحّدة (الإدارة) — العربيّة. يُستدعى عبر tUnified. النصّ منقولٌ حرفيّاً.

export const unifiedAr = {
  needLoginTeacherAdmin: "تحتاج دخولًا كمعلّم/إدارة.",
  loadFailed: "تعذّر التحميل. ",
  retry: "إعادة",
  absentDefaultNote: "الأصل اليوم «غياب»: من لم تَرفعه حاضرًا يُحسب غائبًا. أشِّر الحاضرين من اللوحة.",
  absentNotRaised: "غياب (لم يُرفَع)",
  notRaised: "لم يُرفَع",
  hifzDone: "حفظ ✓",
  pickStudent: "اختر طالبًا من القائمة.",
  excused: "مستأذن…",
  onStageLeave: "في إجازة اختبار المرحلة — لا وجهةَ حفظٍ اليوم.",
  noDailyTasks: "لا مهامّ يوميّة لهذا الطالب (ليس في مراقي ولا القاعدة المدنية).",
  markAllPresent: "الكل حاضر",
  newHifz: "الحفظ الجديد",
  trackCompleted: "أتمّ محفوظ مساره 🎉",
  trackNotSet: "لم يُحدَّد مساره بعد.",
  setTrackBtn: "تحديد المسار",
  addMore: "+ زيادة",
  estimate: "تقدير",
  civilBase: "القاعدة المدنية",
  qaidahCurrentLesson: "القاعدة المدنية — الدرس الحاليّ",
  chapterPrefix: "الباب: ",
  todayPrefix: " · اليوم: ",
  qaidahMastered: "متقن",
  qaidahNotMastered: "غير متقن",
  qaidahDeferred: "مؤجَّل",
  noRasikhYet: "لا محفوظ راسخ بعد.",
  setPath: "تحديد المسار",
  assignTrackTitle: "تعيين المسار",
  suggestedTrack: "المقترح",
  selectTrack: "اختر المسار",
  saveTrack: "حفظ المسار",
  cancelBtn: "إلغاء",
  noteOptional: "ملاحظة (اختياريّة)",
  noteRequired: "السبب (مطلوب لمسارٍ أدنى من المقترح)",
  bulkAssignTracks: "تعيين جماعيّ",
  trackAssigned: "تمّ تعيين المسار.",
  trackAssignFailed: "تعذّر تعيين المسار.",
  autoAssignMissingBtn: "تعيين المسارات الناقصة",
  autoAssignDone: "عُيِّنت المسارات:",
  autoAssignProgress: "جارٍ تعيين المسارات…",
} as const;

export type UnifiedKey = keyof typeof unifiedAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس الشاشة الموحّدة. */
export function tUnified(key: UnifiedKey): string {
  return unifiedAr[key];
}
