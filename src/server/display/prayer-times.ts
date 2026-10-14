import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";

import { NO_ADJUST, PRAYERS, type Prayer, type PrayerAdjust } from "@/lib/display-schedule";

// ═══════════════ مواقيت الصلاة للمدينة المنوّرة (DISPLAY_SCREEN_RULES §١٠) ═══════════════
//
// لا توجد في المنصّة دالّةٌ قائمةٌ تحسب مواقيت الصلاة (حقل Circle.timeSlot رمزيٌّ ASR/MAGHRIB لا حساب
// ساعةٍ فيه)، فتُحسب بمكتبة adhan: طريقة «أمّ القرى» (الرسميّة بالسعوديّة) ومذهب العصر «الجمهور/القياسيّ»
// (ظلّ المثل)، بإحداثيّات المسجد النبويّ. لا أوقاتٌ ثابتة. القرار من مدير المنصّة (أكتوبر ٢٠٢٦).
//
// رمضان: أمّ القرى تجعل العشاء بعد المغرب بـ١٢٠ دقيقة (بدل ٩٠ في سائر السنة). يُحدَّد رمضان بتقويم
// islamic-umalqura عبر Intl — لا بتواريخ مكتوبة. والتعديل اليدويّ بالدقائق لكل صلاة يُطبَّق فوق ذلك.

const MADINAH = new Coordinates(24.4672, 39.6111); // المسجد النبويّ — مرجع الحساب
const RAMADAN_ISHA_AFTER_MAGHRIB_MIN = 120;

/** هل اليومُ المدنيّ (YYYY-MM-DD) في رمضان بتقويم أمّ القرى (الشهر التاسع)؟ */
export function isRamadan(dateISO: string): boolean {
  const [y, m, d] = dateISO.split("-").map(Number);
  const month = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return Number(month) === 9;
}

/**
 * مواقيت الصلاة الخمس للمدينة المنوّرة ليومٍ مدنيّ (YYYY-MM-DD بتوقيت مكّة) — لحظاتٌ مطلقة.
 * يُبنى التاريخ محليّاً عند الظهر لاستخلاص (سنة/شهر/يوم) الصحيحة أيّاً كانت منطقة الخادم
 * (adhan يقرأ مكوّنات التاريخ محليّاً)، والنواتج لحظاتٌ مطلقةٌ مستقلّةٌ عن المنطقة.
 * في رمضان يُضبط العشاء على المغرب + ١٢٠ دقيقة (أمّ القرى).
 */
export function madinahPrayerTimes(dateISO: string): Record<Prayer, Date> {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const params = CalculationMethod.UmmAlQura();
  params.madhab = Madhab.Shafi; // الجمهور/القياسيّ
  const pt = new PrayerTimes(MADINAH, date, params);
  const times: Record<Prayer, Date> = { FAJR: pt.fajr, DHUHR: pt.dhuhr, ASR: pt.asr, MAGHRIB: pt.maghrib, ISHA: pt.isha };
  if (isRamadan(dateISO)) times.ISHA = new Date(pt.maghrib.getTime() + RAMADAN_ISHA_AFTER_MAGHRIB_MIN * 60_000);
  return times;
}

/** المواقيت كلحظاتٍ مطلقة (Date) بعد تطبيق التعديل اليدويّ بالدقائق لكل صلاة. */
export function madinahPrayerTimesAdjusted(dateISO: string, adjust: PrayerAdjust = NO_ADJUST): Record<Prayer, Date> {
  const base = madinahPrayerTimes(dateISO);
  return Object.fromEntries(PRAYERS.map((p) => [p, new Date(base[p].getTime() + (adjust[p] ?? 0) * 60_000)])) as Record<Prayer, Date>;
}

/** خريطة لحظاتٍ (ms) للصلوات الخمس بعد التعديل — ملائمةٌ لـ resolveWindow. */
export function madinahPrayerMs(dateISO: string, adjust: PrayerAdjust = NO_ADJUST): Record<Prayer, number> {
  const t = madinahPrayerTimesAdjusted(dateISO, adjust);
  return Object.fromEntries(PRAYERS.map((p) => [p, t[p].getTime()])) as Record<Prayer, number>;
}
