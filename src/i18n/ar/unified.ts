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
  newHifz: "الحفظ الجديد",
  trackCompleted: "أتمّ محفوظ مساره 🎉",
  trackNotSet: "لم يُحدَّد مساره بعد.",
  setTrackBtn: "تحديد المسار",
  rule1RepeatYesterday: "الحكم ١: يعيد مقطع أمس.",
  from: "من",
  to: "إلى",
  mastered: "أتقن",
  notMastered: "لم يُتقن",
  addMore: "+ زيادة",
  done: "تمّ",
  notDone: "لم يتمّ",
  doneF: "تمّت",
  notDoneF: "لم تتمّ",
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
} as const;

export type UnifiedKey = keyof typeof unifiedAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس الشاشة الموحّدة. */
export function tUnified(key: UnifiedKey): string {
  return unifiedAr[key];
}
