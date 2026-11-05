// قاموس نصوص صفحتَي البرامج (القاعدة المدنية · مراقي) — العربيّة. يُستدعى عبر tPrograms. حرفيّاً.

export const programsPageAr = {
  loading: "جارٍ التحميل…",
  login: "تسجيل الدخول",
  needLoginLadder: "تحتاج دخولًا لعرض السلّم.",
  loadLadderFailed: "تعذّر تحميل السلّم.",
  retryFull: "إعادة المحاولة",
  transitionSettingsToMaraqi: "⚙ إعدادات الانتقال إلى مراقي",
  qaidahCompleted: "أتممتَ دروس القاعدة المدنية — بارك الله فيك ✓",
  yourPositionNow: "موضعك الآن:",
  lastSessionDeferred: "آخر جلسة: مؤجَّل",
  lessonsNotStarted: "لم تبدأ الدروس بعد.",
  goal: "الهدف:",
  noChapterDetails: "لا تفاصيل مبذورة لهذا الباب بعد.",
  needLoginPage: "تحتاج دخولًا لعرض الصفحة.",
  graphLadder: "السلّم البياني",
  preparedTracks: "المسارات المُجهَّزة",
  transitionSettings: "⚙ إعدادات الانتقال",
  loadingLadder: "جارٍ تحميل السلّم…",
  loadLadderFailedSp: "تعذّر تحميل السلّم. ",
  retry: "إعادة",
  intro: "تمهيد:",
  noHarvest: " · بلا حصاد",
} as const;

export type ProgramsPageKey = keyof typeof programsPageAr;

export function tPrograms(key: ProgramsPageKey): string {
  return programsPageAr[key];
}
