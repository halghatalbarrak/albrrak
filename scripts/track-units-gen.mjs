// توليد وحدات المسارات المُجهَّزة (البند ٢، م٣) — منطقٌ نقيٌّ مشترَك (البذر + اختبار vitest).
// حسم محمد: الترتيب تنازليٌّ بالسور (الفاتحة ثمّ الناس نزولاً حتى البقرة) وتصاعديٌّ بالآيات
// داخل كل سورة. نوعان:
//   • مسارات الأسطر (٣، ٥): الوحدة = أسطرٌ نصّيّة فعليّة (تخطّي الترويسات/البسملات غير المحفوظة)،
//     عبر مشيٍ على صفوف MushafLine، الآية لا تُكسَر، ولا تتجاوز الوحدة السورة.
//   • مسارات الصفحات (نصف صفحة، صفحة، صفحتان، ٣، ٤، ٥): الوحدة = (كسر) صفحة مصحفٍ فعليّة
//     بحدودها بالآيات؛ الصفحات مرتّبةٌ بترتيب مراقي (تصاعديّ الآية داخل السورة الطويلة).
// يعتمد صفوف MushafLine الممرَّرة — لا قاعدة بيانات هنا.

export const SURAH_AYAH_COUNTS = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const CUM = (() => { const c = [0, 0]; for (let s = 1; s <= 114; s++) c[s + 1] = c[s] + SURAH_AYAH_COUNTS[s]; return c; })();
const ord = (surah, ayah) => CUM[surah] + ayah;
function ordToAyah(o) { for (let s = 1; s <= 114; s++) if (o <= CUM[s + 1]) return { surah: s, ayah: o - CUM[s] }; return { surah: 114, ayah: 6 }; }
function surahOfOrd(o) { for (let s = 1; s <= 114; s++) if (o <= CUM[s + 1]) return s; return 114; }

/** ترتيب حفظ مراقي: الفاتحة ثمّ الناس (١١٤) نزولاً حتى البقرة (٢). */
export const MARAQI_SURAH_ORDER = [1, ...Array.from({ length: 113 }, (_, i) => 114 - i)];
const ORDER_INDEX = new Map(MARAQI_SURAH_ORDER.map((s, i) => [s, i]));
const maraqiKey = (surah, ayah) => (ORDER_INDEX.get(surah) ?? 999) * 100_000 + ayah;

/** أصغرُ مفتاح مراقي في مدًى (lo..hi) — يحدّد موضع الوحدة في ترتيب الحفظ. */
function minMaraqiKeyInRange(lo, hi) {
  let best = Infinity;
  for (let s = surahOfOrd(lo); s <= surahOfOrd(hi); s++) {
    const firstInRange = Math.max(lo, CUM[s] + 1);
    best = Math.min(best, maraqiKey(s, firstInRange - CUM[s]));
  }
  return best;
}

// ─────────── مسارات الأسطر (٣، ٥) ───────────

function generateLineUnits(lines, linesPerDay) {
  const sorted = lines.slice().sort((a, b) => a.page - b.page || a.lineNo - b.lineNo);
  const bySurah = new Map();
  for (const l of sorted) for (let s = l.startSurah; s <= l.endSurah; s++) { if (!bySurah.has(s)) bySurah.set(s, []); bySurah.get(s).push(l); }

  const units = [];
  let unitNo = 1;
  for (const surah of MARAQI_SURAH_ORDER) {
    const slines = bySurah.get(surah);
    if (!slines || slines.length === 0) continue;
    const last = SURAH_AYAH_COUNTS[surah];
    const surahCap = ord(surah, last);
    let ayah = 1, budget = 0;
    while (ayah <= last) {
      budget += linesPerDay;
      let lineCount = Math.floor(budget + 1e-9); if (lineCount < 1) lineCount = 1; budget -= lineCount;
      const startOrd = ord(surah, ayah);
      let idx0 = slines.findIndex((l) => ord(l.startSurah, l.startAyah) <= startOrd && ord(l.endSurah, l.endAyah) >= startOrd);
      if (idx0 < 0) idx0 = 0;
      const targetIdx = Math.min(idx0 + lineCount - 1, slines.length - 1);
      const endOrd = Math.min(ord(slines[targetIdx].endSurah, slines[targetIdx].endAyah), surahCap);
      const endAyah = endOrd - ord(surah, 0);
      units.push({ unitNo: unitNo++, startSurah: surah, startAyah: ayah, endSurah: surah, endAyah });
      ayah = endAyah + 1;
    }
  }
  return units;
}

// ─────────── مسارات الصفحات (٠٫٥، ١، ٢، ٣، ٤، ٥) ───────────

function generatePageUnits(lines, pagesPerUnit) {
  const sorted = lines.slice().sort((a, b) => a.page - b.page || a.lineNo - b.lineNo);
  // ملكيّة الآية للصفحة التي تبدأ فيها (أوّل ظهور)، فلا تتكرّر آيةٌ عبر حدود الصفحات.
  const startPage = new Map();
  for (const l of sorted) { const lo = ord(l.startSurah, l.startAyah), hi = ord(l.endSurah, l.endAyah); for (let o = lo; o <= hi; o++) if (!startPage.has(o)) startPage.set(o, l.page); }
  const owned = new Map();
  for (const [o, p] of startPage) { const e = owned.get(p) ?? { min: o, max: o }; if (o < e.min) e.min = o; if (o > e.max) e.max = o; owned.set(p, e); }

  // الصفحات مرتّبةٌ بترتيب مراقي (أصغر مفتاحٍ لآياتها المملوكة).
  const pages = [...owned.keys()].map((p) => ({ min: owned.get(p).min, max: owned.get(p).max, key: minMaraqiKeyInRange(owned.get(p).min, owned.get(p).max) }));
  pages.sort((a, b) => a.key - b.key);

  const raw = []; // {min,max}
  if (pagesPerUnit === 0.5) {
    for (const pg of pages) {
      // الفاتحة كاملةً (استثناءً)؛ والصفحة القصيرة (آيةٌ واحدة) كاملة.
      if (surahOfOrd(pg.min) === 1 || pg.max === pg.min) { raw.push({ min: pg.min, max: pg.max }); continue; }
      const mid = pg.min + Math.ceil((pg.max - pg.min + 1) / 2) - 1;
      raw.push({ min: pg.min, max: mid });
      raw.push({ min: mid + 1, max: pg.max });
    }
  } else {
    const K = pagesPerUnit;
    let cur = null;
    for (const pg of pages) {
      const contiguous = cur && (pg.min === cur.max + 1 || pg.max + 1 === cur.min); // نفس المدى المتّصل
      if (cur && cur.pages < K && contiguous) { cur.min = Math.min(cur.min, pg.min); cur.max = Math.max(cur.max, pg.max); cur.pages++; }
      else { if (cur) raw.push({ min: cur.min, max: cur.max }); cur = { min: pg.min, max: pg.max, pages: 1 }; }
    }
    if (cur) raw.push({ min: cur.min, max: cur.max });
  }

  // ترقيمٌ بترتيب مراقي.
  return raw
    .map((u) => ({ ...u, key: minMaraqiKeyInRange(u.min, u.max) }))
    .sort((a, b) => a.key - b.key)
    .map((u, i) => { const s = ordToAyah(u.min), e = ordToAyah(u.max); return { unitNo: i + 1, startSurah: s.surah, startAyah: s.ayah, endSurah: e.surah, endAyah: e.ayah }; });
}

/**
 * يولّد وحدات مسارٍ من صفوف MushafLine بمقدار linesPerDay. مقدارٌ < ٧٫٥ ⟵ مسار أسطر (أسطر
 * نصّيّة فعليّة)؛ ≥ ٧٫٥ ⟵ مسار صفحات (pagesPerUnit = linesPerDay/15، فنصف صفحة ٠٫٥). يعيد
 * مصفوفةً مرقّمةً بترتيب الحفظ: { unitNo, startSurah, startAyah, endSurah, endAyah }.
 */
export function generateTrackUnits(lines, linesPerDay) {
  return linesPerDay >= 7.5 ? generatePageUnits(lines, linesPerDay / 15) : generateLineUnits(lines, linesPerDay);
}
