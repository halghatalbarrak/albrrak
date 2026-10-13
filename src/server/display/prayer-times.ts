import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";

import { PRAYERS, type Prayer } from "@/lib/display-schedule";

// ═══════════════ مواقيت الصلاة للمدينة المنوّرة (DISPLAY_SCREEN_RULES §١٠) ═══════════════
//
// لا توجد في المنصّة دالّةٌ قائمةٌ تحسب مواقيت الصلاة (حقل Circle.timeSlot رمزيٌّ ASR/MAGHRIB لا حساب
// ساعةٍ فيه)، فتُحسب بمكتبة adhan: طريقة «أمّ القرى» (الرسميّة بالسعوديّة) ومذهب العصر «الجمهور/القياسيّ»
// (ظلّ المثل)، بإحداثيّات المسجد النبويّ. لا أوقاتٌ ثابتة. القرار من مدير المنصّة (أكتوبر ٢٠٢٦).

const MADINAH = new Coordinates(24.4672, 39.6111); // المسجد النبويّ — مرجع الحساب

/**
 * مواقيت الصلاة الخمس للمدينة المنوّرة ليومٍ مدنيّ (YYYY-MM-DD بتوقيت مكّة) — لحظاتٌ مطلقة.
 * يُبنى التاريخ محليّاً عند الظهر لاستخلاص (سنة/شهر/يوم) الصحيحة أيّاً كانت منطقة الخادم
 * (adhan يقرأ مكوّنات التاريخ محليّاً)، والنواتج لحظاتٌ مطلقةٌ مستقلّةٌ عن المنطقة.
 */
export function madinahPrayerTimes(dateISO: string): Record<Prayer, Date> {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const params = CalculationMethod.UmmAlQura();
  params.madhab = Madhab.Shafi; // الجمهور/القياسيّ
  const pt = new PrayerTimes(MADINAH, date, params);
  return { FAJR: pt.fajr, DHUHR: pt.dhuhr, ASR: pt.asr, MAGHRIB: pt.maghrib, ISHA: pt.isha };
}

/** خريطة لحظاتٍ (ms) للصلوات الخمس — ملائمةٌ لـ resolveWindow. */
export function madinahPrayerMs(dateISO: string): Record<Prayer, number> {
  const t = madinahPrayerTimes(dateISO);
  return Object.fromEntries(PRAYERS.map((p) => [p, t[p].getTime()])) as Record<Prayer, number>;
}
