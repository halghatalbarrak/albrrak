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

/** يُولّد رسائل التحفيز من لقطة الحال (قوالبُ i18n + متغيّرات). */
export function buildMotivations(input: MotivationInput): Motivation[] {
  const out: Motivation[] = [];

  // سلسلةٌ مهدّدة اليوم: الأهمّ — أتمّ قبل منتصف الليل.
  if (!input.doneToday && input.streakCurrent > 0) {
    out.push({ type: "STREAK_AT_RISK", text: fillTemplate(gamificationAr.motiveStreakAtRisk, { days: `${arNum(input.streakCurrent)} ${gamificationAr.dayWord}` }) });
  }
  // أوّل خطوة: لا سلسلةَ بعد.
  if (input.streakCurrent === 0 && !input.doneToday) {
    out.push({ type: "FIRST_STEP", text: gamificationAr.motiveFirstStep });
  }
  // اقتراب وسام.
  if (input.nearestBadge && input.nearestBadge.remaining > 0) {
    out.push({ type: "BADGE_NEAR", text: fillTemplate(gamificationAr.motiveBadgeNear, { remaining: `${arNum(input.nearestBadge.remaining)} ${gamificationAr.dayWord}`, badge: input.nearestBadge.nameAr }) });
  }
  // تقدّم المحطّة الحاليّة.
  if (input.currentStation && input.currentStation.total > 0) {
    out.push({ type: "STATION_PROGRESS", text: fillTemplate(gamificationAr.motiveStationProgress, { done: arNum(input.currentStation.done), total: arNum(input.currentStation.total), station: input.currentStation.label }) });
  }
  return out;
}
