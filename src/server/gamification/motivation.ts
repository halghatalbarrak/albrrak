import { arNum } from "@/lib/format";
import { fillTemplate, gamificationAr } from "@/i18n/ar/gamification";

// ═══════════════ رسائل التحفيز — مُولِّدٌ نقيّ (ل٥، §٦) ═══════════════
//
// أنواعٌ معرَّفة (قائمةٌ ثابتة) ولكلٍّ قالبٌ عربيٌّ بمتغيّراتٍ محدّدة (يعدّله المدير في ل٦). المُولّد
// نقيٌّ: يأخذ لقطةً من حال الطالب ويُخرج الرسائل المناسبة بترتيب الأهمّيّة. لا نصوصَ ثابتةً هنا.

export type MotivationType = "STREAK_AT_RISK" | "FIRST_STEP" | "BADGE_NEAR" | "STATION_PROGRESS";

export interface MotivationInput {
  streakCurrent: number;
  doneToday: boolean; // أُتمّ يوم اليوم (مدموجاً عبر البرامج)؟
  /** أقرب وسامٍ قادم (سلسلة) وعدد الأيّام المتبقّية له. */
  nearestBadge: { remaining: number; nameAr: string } | null;
  /** تقدّم المحطّة الحاليّة لأبرز برنامج. */
  currentStation: { done: number; total: number; label: string } | null;
}

export interface Motivation { type: MotivationType; text: string }

/** قوالبُ الأنواع (يعدّلها المدير، ل٦). الافتراض من i18n؛ ويُمرَّر بدلٌ من قوالب المدير المفعّلة. */
export interface MotivationTemplates { STREAK_AT_RISK: string; FIRST_STEP: string; BADGE_NEAR: string; STATION_PROGRESS: string }
export const DEFAULT_TEMPLATES: MotivationTemplates = {
  STREAK_AT_RISK: gamificationAr.motiveStreakAtRisk,
  FIRST_STEP: gamificationAr.motiveFirstStep,
  BADGE_NEAR: gamificationAr.motiveBadgeNear,
  STATION_PROGRESS: gamificationAr.motiveStationProgress,
};

/** يُولّد رسائل التحفيز من لقطة الحال (قوالبُ المدير أو الافتراض + متغيّرات). */
export function buildMotivations(input: MotivationInput, templates: MotivationTemplates = DEFAULT_TEMPLATES): Motivation[] {
  const out: Motivation[] = [];

  // سلسلةٌ مهدّدة اليوم: الأهمّ — أتمّ قبل منتصف الليل.
  if (!input.doneToday && input.streakCurrent > 0) {
    out.push({ type: "STREAK_AT_RISK", text: fillTemplate(templates.STREAK_AT_RISK, { days: `${arNum(input.streakCurrent)} ${gamificationAr.dayWord}` }) });
  }
  // أوّل خطوة: لا سلسلةَ بعد.
  if (input.streakCurrent === 0 && !input.doneToday) {
    out.push({ type: "FIRST_STEP", text: templates.FIRST_STEP });
  }
  // اقتراب وسام.
  if (input.nearestBadge && input.nearestBadge.remaining > 0) {
    out.push({ type: "BADGE_NEAR", text: fillTemplate(templates.BADGE_NEAR, { remaining: `${arNum(input.nearestBadge.remaining)} ${gamificationAr.dayWord}`, badge: input.nearestBadge.nameAr }) });
  }
  // تقدّم المحطّة الحاليّة.
  if (input.currentStation && input.currentStation.total > 0) {
    out.push({ type: "STATION_PROGRESS", text: fillTemplate(templates.STATION_PROGRESS, { done: arNum(input.currentStation.done), total: arNum(input.currentStation.total), station: input.currentStation.label }) });
  }
  return out;
}
