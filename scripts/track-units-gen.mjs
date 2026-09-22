// توليد وحدات المسارات المُجهَّزة (البند ٢، المرحلة ٣) — منطقٌ نقيٌّ مشترَك بين سكربت البذر
// واختبار vitest. يقسّم القرآن كاملاً لمسارٍ بمقداره (linesPerDay) إلى وحداتٍ بحدود آيات،
// بترتيب حفظ مراقي (الفاتحة ثم الناس نزولاً حتى البقرة)، والآية لا تُكسَر، وحدّ السورة.
// يعتمد خريطة السطر↔الآية (صفوف MushafLine) الممرَّرة إليه — لا قاعدة بيانات هنا.

/** عدد آيات كل سورة (عدّ الكوفة)، مفهرسًا من ١ (٠ حشو). مطابقٌ لـsrc/server/quran-ordinal.ts. */
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

/** ترتيب حفظ مراقي: الفاتحة (استثناءً) ثمّ الناس (١١٤) نزولاً حتى البقرة (٢). */
export const MARAQI_SURAH_ORDER = [1, ...Array.from({ length: 113 }, (_, i) => 114 - i)];

/**
 * يولّد وحدات مسارٍ من صفوف MushafLine (page, lineNo, startSurah/startAyah, endSurah/endAyah)
 * بمقدار linesPerDay. يعيد مصفوفةً مرتّبةً بترتيب الحفظ: كلٌّ { unitNo, startSurah, startAyah,
 * endSurah, endAyah } (كل وحدةٍ داخل سورةٍ واحدة). كسورٌ في المقدار (٧٫٥) بميزانيّةٍ متراكمة
 * فتتناوب الأسطر (٧/٨) بلا انحراف. الآية لا تُكسَر، والوحدة لا تتجاوز السورة.
 */
export function generateTrackUnits(lines, linesPerDay) {
  // فهرسة أسطر كل سورة بترتيب القراءة (وجهٌ ثمّ سطر).
  const sorted = lines.slice().sort((a, b) => a.page - b.page || a.lineNo - b.lineNo);
  const bySurah = new Map();
  for (const l of sorted) {
    for (let s = l.startSurah; s <= l.endSurah; s++) {
      if (!bySurah.has(s)) bySurah.set(s, []);
      bySurah.get(s).push(l);
    }
  }

  const units = [];
  let unitNo = 1;
  for (const surah of MARAQI_SURAH_ORDER) {
    const slines = bySurah.get(surah);
    if (!slines || slines.length === 0) continue;
    const last = SURAH_AYAH_COUNTS[surah];
    const surahCap = ord(surah, last);
    let ayah = 1;
    let budget = 0;
    while (ayah <= last) {
      budget += linesPerDay;
      let lineCount = Math.floor(budget + 1e-9);
      if (lineCount < 1) lineCount = 1;
      budget -= lineCount;

      const startOrd = ord(surah, ayah);
      let idx0 = slines.findIndex((l) => ord(l.startSurah, l.startAyah) <= startOrd && ord(l.endSurah, l.endAyah) >= startOrd);
      if (idx0 < 0) idx0 = 0; // حارسٌ (لا ينبغي بلوغه)
      const targetIdx = Math.min(idx0 + lineCount - 1, slines.length - 1);
      const endLine = slines[targetIdx];
      const endOrd = Math.min(ord(endLine.endSurah, endLine.endAyah), surahCap);
      const endAyah = endOrd - ord(surah, 0);

      units.push({ unitNo, startSurah: surah, startAyah: ayah, endSurah: surah, endAyah });
      unitNo++;
      ayah = endAyah + 1;
    }
  }
  return units;
}
