// قاموس نصوص التلعيب (العربيّة) — المصدر الوحيد لكلّ نصٍّ يظهر للطالب (GAMIFICATION_RULES.md §٨).
// الأرقام تُعرض مشرقيّةً في طبقة العرض (arNum). رسائل التحفيز قوالبُ بمتغيّرات {…} يعدّلها المدير (ل٦).

export const gamificationAr = {
  journeyTitle: "رحلتي",
  journeySummary: "رحلتي والأوسمة",

  // السلسلة
  streakTitle: "السلسلة",
  streakCurrent: "سلسلتك الحاليّة",
  streakLongest: "أطول سلسلة",
  dayWord: "يوم",

  // النقاط
  pointsTitle: "النقاط",
  balanceLabel: "الرصيد",
  weekPointsLabel: "هذا الأسبوع",
  lastEarnedLabel: "آخر ما كُسب",
  noPointsYet: "لا نقاط بعد.",

  // الأوسمة
  badgesEarned: "أوسمتك",
  badgesUpcoming: "أوسمةٌ قادمة",
  noBadgesYet: "لا أوسمة بعد — ابدأ رحلتك!",
  badgeJustAwarded: "وسامٌ جديد! 🎉",

  // الخريطة
  roadmapTitle: "خريطة الطريق",
  stationDone: "مُنجَزة",
  stationCurrent: "الحاليّة",
  stationLocked: "مقفلة",
  comingSoon: "قيد الإعداد",
  progressOf: "من", // «٣ من ٦»

  // أسماء البرامج (للعناوين)
  programMUDDAKIR: "المُدَّكِر",
  programMARAQI: "مراقي",
  programQAIDAH_MADANIYYAH: "القاعدة المدنية",
  programWEEKLY: "البرنامج الأسبوعيّ",

  // رسائل التحفيز (قوالبُ بمتغيّرات — يعدّلها المدير، §٦)
  motiveStreakAtRisk: "سلسلتك {days} — أتمّ اليوم لئلّا تنقطع 🔥",
  motiveBadgeNear: "بقي {remaining} لوسام «{badge}» 🏅",
  motiveStationProgress: "أنجزتَ {done} من {total} في {station} — واصِل ✨",
  motiveFirstStep: "أتمّ يومك الأوّل لتبدأ سلسلتك 🌱",
} as const;

export type GamificationKey = keyof typeof gamificationAr;

export function tGami(key: GamificationKey): string {
  return gamificationAr[key];
}

/** يملأ قالباً بمتغيّراته: fill("بقي {n}", {n:"٣"}) → «بقي ٣». */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

const PROGRAM_KEYS: Record<string, GamificationKey> = {
  MUDDAKIR: "programMUDDAKIR",
  MARAQI: "programMARAQI",
  QAIDAH_MADANIYYAH: "programQAIDAH_MADANIYYAH",
  WEEKLY: "programWEEKLY",
};

/** اسم البرنامج العربيّ من مفتاحه. */
export function programName(programKey: string): string {
  const k = PROGRAM_KEYS[programKey];
  return k ? gamificationAr[k] : programKey;
}
