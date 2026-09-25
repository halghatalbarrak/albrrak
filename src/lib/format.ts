// اللغة البصريّة (الفكرة ٧): أرقامٌ هنديّة وتقويمٌ هجريّ للعرض.

import { surahName } from "./surah-names";

const AR = "٠١٢٣٤٥٦٧٨٩";

/** يحوّل الأرقام اللاتينيّة إلى هنديّةٍ عربيّة (للعرض فقط). */
export const arNum = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => AR[Number(d)]);

/**
 * عددٌ ومعدودٌ عربيّان صحيحان بأرقامٍ هنديّة: واحدٌ (مفرد)، اثنان (مثنّى)،
 * ٣–١٠ (جمع)، ≥١١ (تمييزٌ مفردٌ منصوب). مثال: count(5,"سطر","سطران","أسطر","سطرًا") → «٥ أسطر».
 */
export function count(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${arNum(n)} ${few}`;
  return `${arNum(n)} ${many}`;
}

/** «س/يوم» بعددٍ ومعدودٍ صحيحين للأسطر: «سطر/يوم»، «٣ أسطر/يوم»، «١٥ سطرًا/يوم». */
export const linesPerDay = (n: number): string => `${count(n, "سطر", "سطران", "أسطر", "سطرًا")}/يوم`;

const NDASH = "–"; // شرطةٌ متوسّطة للمدى، محاطةٌ بمسافتين

/**
 * يعرض موضع آيةٍ أو مدًى باسم السورة وأرقامٍ هنديّة، من مصدر الأسماء الثابت:
 *   • آيةٌ واحدة:        formatAyah(1, 1)          → «الفاتحة ١»
 *   • مدًى في سورة:      formatAyah(1, 1, 1, 6)    → «الفاتحة ١ – ٦»
 *   • مدًى عابرٌ للسور:   formatAyah(112, 1, 114, 6) → «الإخلاص ١ – الناس ٦»
 * يُمرَّر (toSurah, toAyah) للمدى؛ وإن ساويا البداية أو غابا فآيةٌ واحدة.
 */
export function formatAyah(fromSurah: number, fromAyah: number, toSurah?: number, toAyah?: number): string {
  const start = `${surahName(fromSurah)} ${arNum(fromAyah)}`;
  if (toSurah == null || toAyah == null) return start;
  if (toSurah === fromSurah && toAyah === fromAyah) return start;
  if (toSurah === fromSurah) return `${start} ${NDASH} ${arNum(toAyah)}`;
  return `${start} ${NDASH} ${surahName(toSurah)} ${arNum(toAyah)}`;
}

/** يعرض تاريخ ISO (YYYY-MM-DD) بالتقويم الهجريّ (أمّ القرى) بأرقامٍ هنديّة. */
export function hijri(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(Date.UTC(y, m - 1, d))) + " هـ";
  } catch {
    return arNum(iso);
  }
}
