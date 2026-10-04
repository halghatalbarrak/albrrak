// يوم المُدَّكِر (§٣): من منتصف الليل إلى منتصف الليل بتوقيت مكّة (Asia/Riyadh)، لا بتوقيت الجهاز.
// مستقلّةٌ تماماً عن أدوات اليوم القائمة (التي تعتمد UTC: toISOString().slice(0,10))، ولا تمسّ مراقي.
// المنطقة الزمنيّة ثابتةٌ بالحكم (§٣)، لا إعدادَ لها؛ وإزاحتها تُشتقّ من Intl لا تُكتب رقماً.

const TZ = "Asia/Riyadh";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** تنسيق YYYY-MM-DD لِلحظةٍ في منطقةٍ زمنيّة عبر Intl (en-CA يعطي ISO مباشرةً). */
function civilDateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** إزاحة المنطقة الزمنيّة (ملّي ثانية) للحظةٍ معيّنة = ساعة الحائط فيها ناقص UTC. مشتقّةٌ من Intl. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const wall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return wall - instant.getTime();
}

/** اليوم القرآنيّ (YYYY-MM-DD) الذي تقع فيه لحظةٌ ما، بتوقيت مكّة. */
export function makkahDayDate(instant: Date): string {
  return civilDateIn(instant, TZ);
}

/**
 * حدود يومٍ قرآنيّ [البداية، النهاية) كلحظتَي UTC: بدايته منتصف الليل بمكّة، ونهايته منتصف
 * ليل اليوم التالي. النهاية حصريّة (تنتمي لليوم التالي). date = YYYY-MM-DD بتوقيت مكّة.
 */
export function makkahDayBounds(date: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`تاريخٌ غير صالح: ${date}`);
  // منتصف الليل بمكّة = منتصف ليل UTC الاسميّ ناقص إزاحة المنطقة عند تلك اللحظة.
  const naiveMidnightUTC = Date.parse(`${date}T00:00:00Z`);
  const offset = tzOffsetMs(new Date(naiveMidnightUTC), TZ);
  const start = new Date(naiveMidnightUTC - offset);
  const end = new Date(start.getTime() + MS_PER_DAY);
  return { start, end };
}

/** فرق الأيّام بين تاريخَين قرآنيّين (YYYY-MM-DD): later − earlier (موجبٌ إن كان later أحدث). */
export function dayDiff(laterISO: string, earlierISO: string): number {
  return Math.round((Date.parse(`${laterISO}T00:00:00Z`) - Date.parse(`${earlierISO}T00:00:00Z`)) / MS_PER_DAY);
}

/** رقم اليوم منذ حقبة يونكس لتاريخٍ قرآنيّ (YYYY-MM-DD) — لدوران الدورات. */
export function epochDay(dateISO: string): number {
  return Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / MS_PER_DAY);
}
