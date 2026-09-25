// ═══════════════ ترجمة واجهة تسكين مراقي البصريّة ⟵ MaraqiPlacement ═══════════════
//
// البند ٥: تحوّل الشبكةُ البصريّة (أجزاءٌ محفوظةٌ كاملةً + موضع وصولٍ + سورٌ مفردة + نطاقاتٌ
// دقيقة) إلى حمولة MaraqiPlacement القائمة {reachedSurah, reachedAyah, outOfOrder} بلا أيّ
// تغييرٍ في المخطّط ولا الخادم. الدلالة مطابقةٌ لما يقرؤه today-target:
//   • reachedSurah/reachedAyah: الجبهة المتّصلة بترتيب مراقي (الفاتحة ثمّ ١١٤ نزولاً).
//     كل وحدةٍ مفتاحُها ≤ الجبهة تُعدّ محفوظةً بالترتيب.
//   • outOfOrder: نطاقاتٌ محفوظةٌ منفصلةٌ وراء الجبهة، بترتيب مراقي (from مفتاحُه أصغر).
// الأعداد من المصدر الموقَّع (surah-names/juz-bounds) — لا يُكتب بيانٌ قرآنيّ من الذاكرة.

import { maraqiKey } from "./maraqi-order";
import { SURAH_AYAH_COUNTS_TANZIL } from "./surah-names";
import { JUZ_BOUNDS } from "./juz-bounds";

export interface OoORange { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }

export interface GridInput {
  /** أرقام الأجزاء المحفوظة كاملةً (١..٣٠). */
  fullyMemorizedJuz: number[];
  /** موضع الوصول بالترتيب (منتقي السور + الآية) — اختياريّ، يرفع الجبهة إن تجاوز الشبكة. */
  reachedSurah?: number | null;
  reachedAyah?: number | null;
  /** سورٌ مفردة محفوظةٌ خارج الترتيب (بأسمائها). */
  singleSurahs: number[];
  /** نطاقاتٌ دقيقة (خيار متقدّم) — بترتيب المصحف؛ تُطبَّع داخليّاً. */
  preciseRanges: OoORange[];
}

export interface Placement { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: OoORange[] }

const last = (s: number): number => SURAH_AYAH_COUNTS_TANZIL[s] ?? 0;

/** يفكّ مفتاح مراقي إلى (سورة، آية). */
function decode(key: number): { surah: number; ayah: number } {
  const idx = Math.floor(key / 100_000);
  return { surah: idx === 0 ? 1 : 115 - idx, ayah: key % 100_000 };
}

type Interval = [number, number]; // [aLo, aHi] داخل سورةٍ واحدة
function mergeIntervals(arr: Interval[]): Interval[] {
  const s = arr.slice().sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [lo, hi] of s) {
    const t = out[out.length - 1];
    if (t && lo <= t[1] + 1) t[1] = Math.max(t[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/** يحوّل الشبكة البصريّة إلى حمولة MaraqiPlacement القائمة. دالّةٌ نقيّةٌ قابلةٌ للاختبار. */
export function gridToPlacement(input: GridInput): Placement {
  // ١) تجميع التغطية بالآيات لكل سورة (أجزاء + سورٌ مفردة + نطاقاتٌ دقيقة).
  const cover = new Map<number, Interval[]>();
  const add = (s: number, a0: number, a1: number) => {
    if (a1 < a0) return;
    const arr = cover.get(s) ?? [];
    arr.push([a0, a1]);
    cover.set(s, arr);
  };
  const addSpan = (s0: number, a0: number, s1: number, a1: number) => {
    for (let s = s0; s <= s1; s++) add(s, s === s0 ? a0 : 1, s === s1 ? a1 : last(s));
  };

  for (const j of input.fullyMemorizedJuz) {
    const b = JUZ_BOUNDS[j - 1];
    if (b) addSpan(b.startSurah, b.startAyah, b.endSurah, b.endAyah);
  }
  for (const s of input.singleSurahs) add(s, 1, last(s));
  for (const r of input.preciseRanges) {
    const A = { s: r.fromSurah, a: r.fromAyah }, B = { s: r.toSurah, a: r.toAyah };
    const [lo, hi] = A.s < B.s || (A.s === B.s && A.a <= B.a) ? [A, B] : [B, A];
    addSpan(lo.s, lo.a, hi.s, hi.a);
  }

  const merged = new Map<number, Interval[]>();
  for (const [s, arr] of cover) merged.set(s, mergeIntervals(arr));

  // ٢) الجبهة المتّصلة بترتيب مراقي، بدءًا من أوّل موضعٍ بعد الفاتحة (السورة ١١٤) نزولاً.
  const prefixAyah = (s: number): number => {
    const arr = merged.get(s);
    return arr && arr.length && arr[0][0] === 1 ? arr[0][1] : 0; // أطول بادئةٍ من الآية ١
  };
  let frontierKey = 0, hasFrontier = false;
  for (let idx = 1; idx <= 113; idx++) {
    const s = 115 - idx;
    const p = prefixAyah(s);
    if (p === 0) break;
    frontierKey = maraqiKey(s, p);
    hasFrontier = true;
    if (p < last(s)) break; // بادئةٌ جزئيّة ⟵ تقف الجبهة هنا
  }

  // منتقي موضع الوصول يرفع الجبهة إن تجاوز ما أثبتته الشبكة.
  if (input.reachedSurah != null) {
    const pk = maraqiKey(input.reachedSurah, input.reachedAyah ?? last(input.reachedSurah));
    if (!hasFrontier || pk > frontierKey) { frontierKey = pk; hasFrontier = true; }
  }

  // ٣) ما وراء الجبهة ⟵ نطاقاتٌ خارج الترتيب، بترتيب مراقي (تصاعديّ)، مع دمج المتّصل.
  const runs: OoORange[] = [];
  let cur: { fromS: number; fromA: number; toS: number; toA: number; endIdx: number } | null = null;
  const flush = () => { if (cur) runs.push({ fromSurah: cur.fromS, fromAyah: cur.fromA, toSurah: cur.toS, toAyah: cur.toA }); };

  for (let idx = 0; idx <= 113; idx++) {
    const s = idx === 0 ? 1 : 115 - idx;
    const arr = merged.get(s);
    if (!arr) continue;
    for (const [aLo0, aHi] of arr) {
      let aLo = aLo0;
      if (hasFrontier) {
        if (maraqiKey(s, aHi) <= frontierKey) continue; // محفوظٌ بالترتيب بالكامل
        const f = decode(frontierKey);
        if (f.surah === s && aLo <= f.ayah) aLo = f.ayah + 1; // قصٌّ للجزء الواقع خلف الجبهة
      }
      if (aLo > aHi) continue;
      if (cur && idx === cur.endIdx + 1 && aLo === 1 && cur.toA === last(cur.toS)) {
        cur.toS = s; cur.toA = aHi; cur.endIdx = idx; // وصلٌ لسورةٍ تالية متّصلة
      } else {
        flush();
        cur = { fromS: s, fromA: aLo, toS: s, toA: aHi, endIdx: idx };
      }
    }
  }
  flush();

  const f = hasFrontier ? decode(frontierKey) : null;
  return { reachedSurah: f?.surah ?? null, reachedAyah: f?.ayah ?? null, outOfOrder: runs };
}
