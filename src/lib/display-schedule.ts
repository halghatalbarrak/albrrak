// منطق المواعيد النقيّ للشاشة التحفيزيّة (DISPLAY_SCREEN_RULES §١٠).
// بلا اعتمادٍ على الخادم ولا على مكتبة حساب المواقيت — يُشارَك بين الخادم (حلّ نوافذ اليوم)،
// والمتصفّح (اختيار الموعد الحاليّ كل دقيقة)، والاختبارات. كل الحساب بلحظاتٍ مطلقة (ms) فلا يتأثّر بمنطقة الجهاز.

export type Prayer = "FAJR" | "DHUHR" | "ASR" | "MAGHRIB" | "ISHA";
export const PRAYERS: readonly Prayer[] = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"];

/** تعديلٌ يدويّ بالدقائق لكل صلاة (إعدادات الشاشة)، افتراضيّه صفر. يُطبَّق فوق الحساب. */
export type PrayerAdjust = Record<Prayer, number>;
export const NO_ADJUST: PrayerAdjust = { FAJR: 0, DHUHR: 0, ASR: 0, MAGHRIB: 0, ISHA: 0 };

const TZ = "Asia/Riyadh";

/** "HH:MM" بتوقيت مكّة للحظةٍ مطلقة. */
export function hhmmMakkah(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

/** يوم الأسبوع (٠=الأحد … ٦=السبت) لتاريخٍ مدنيّ YYYY-MM-DD — ثابتٌ لا يتأثّر بالمنطقة الزمنيّة. */
export function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

export const ALL_DAYS = 0b1111111; // ١٢٧ — كلّ أيّام الأسبوع

export interface ScheduleDef {
  id: string;
  ordinal: number; // الأولويّة عند التداخل: الأصغر يغلب
  startMode: "PRAYER" | "FIXED";
  prayer: Prayer | null;
  rel: "AFTER" | "BEFORE" | null;
  offsetMin: number;
  fixedTime: string | null; // "HH:MM" بتوقيت مكّة
  durationMin: number;
  daysMask: number; // بتات أيّام الأسبوع (bit0=الأحد … bit6=السبت)
  active: boolean;
}

export interface ResolvedWindow {
  id: string;
  startMs: number;
  endMs: number;
}

/**
 * يحلّ نافذة موعدٍ ليومٍ مدنيّ (YYYY-MM-DD بتوقيت مكّة) إلى لحظتَي بداية ونهاية مطلقتَين.
 * null إن كان معطّلاً، أو لا ينطبق على يوم الأسبوع، أو بياناته ناقصة.
 */
export function resolveWindow(
  def: ScheduleDef,
  dateISO: string,
  prayerMs: Record<Prayer, number>,
  makkahMidnightMs: number,
): ResolvedWindow | null {
  if (!def.active) return null;
  if (!(def.daysMask & (1 << weekdayOf(dateISO)))) return null;
  let start: number;
  if (def.startMode === "PRAYER") {
    if (!def.prayer || !def.rel) return null;
    const base = prayerMs[def.prayer];
    start = def.rel === "AFTER" ? base + def.offsetMin * 60000 : base - def.offsetMin * 60000;
  } else {
    if (!def.fixedTime || !/^\d{2}:\d{2}$/.test(def.fixedTime)) return null;
    const [hh, mm] = def.fixedTime.split(":").map(Number);
    start = makkahMidnightMs + (hh * 60 + mm) * 60000;
  }
  return { id: def.id, startMs: start, endMs: start + def.durationMin * 60000 };
}

/** هل تتقاطع فترتان [aS,aE) و[bS,bE)؟ */
export function intervalsOverlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

/**
 * يختار الموعد الحاليّ: أوّل نافذةٍ (بترتيب الأولويّة الممرَّر) تحوي اللحظة.
 * البداية شاملة والنهاية حصريّة. يُفترَض أنّ النوافذ مرتّبةٌ بالأولويّة (ordinal تصاعديّاً)، فالأعلى يغلب.
 */
export function pickActiveWindow<T extends { startMs: number; endMs: number }>(windows: readonly T[], nowMs: number): T | null {
  for (const w of windows) if (nowMs >= w.startMs && nowMs < w.endMs) return w;
  return null;
}
