// قاموس نصوص صفحة الطالب «صفحتي» (العربيّة). يُستدعى عبر tMe. النصّ منقولٌ حرفيّاً.

export const meAr = {
  loading: "جارٍ التحميل…",
  journeyBadges: "رحلتي والأوسمة 🔥🏅",
  journeyDesc: "خريطة تقدّمك في برامجك، وسلسلتك، وأوسمتك.",
  childrenBaydar: "بيدر أبنائي 🌱",
  childrenBaydarDesc: "تابِع بيدر أبنائك وأضِف ثمرةً تحفيزيّة يجنيها ابنك بنقاطه.",
  recentActivity: "آخر الحركات",
  noStudentRecord: "لا سجلّ طالبٍ مرتبطٌ بحسابك.",
  yourStatus: "حالتك",
  openCivilBaseLadder: "افتح سلّم القاعدة المدنية",
  todayTask: "مهمّتك اليوم",
  estimateHint: "تقديرٌ إرشاديّ (لا موعد يُحاسَب عليه)",
  finishBetween: " تُتمّ ما بين يديك نحو ",
  semicolon: "؛",
  finishMaraqi: " وتُتمّ مراقي بإذن الله نحو ",
  needReview: "مواضع تحتاج مراجعة",
  openMaraqiLadder: "افتح سلّم مراقي",
  logout: "خروج",
  weaknessHint: "هذه مواضعُ تحتاج شيئًا من مراجعتك — كلّما اشتدّ لونها فأولِها مزيدَ عناية. اجعلها ورد يومك القادم بإذن الله.",
  repeatWarnPrefix: "⚠️ عليك إعادة مقطع أمس (لم يُتقن): ",
  repeatWarnSuffix: " — لا حفظ جديد قبله.",
} as const;

export type MeKey = keyof typeof meAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس صفحة الطالب. */
export function tMe(key: MeKey): string {
  return meAr[key];
}
