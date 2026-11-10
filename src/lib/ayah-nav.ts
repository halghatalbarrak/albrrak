// تنقّل الآيات بحسب ترتيب حفظ مراقي (الفاتحة ثمّ الناس نزولاً حتى البقرة).
// وظائف نقيّة — صالحة للعميل والخادم.

import { MARAQI_SURAH_ORDER } from "./maraqi-order";

/** عدد آيات كل سورة (الفهرس ٠ حشوٌ)، مطابقٌ لـ SURAH_AYAH_COUNTS (عدّ الكوفة). */
export const AYAH_COUNTS: readonly number[] = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const ORDER_IDX = new Map(MARAQI_SURAH_ORDER.map((s, i) => [s, i]));

/**
 * الموضع التالي (toSurah + toAyah) بحسب ترتيب مراقي.
 * يُرجع null عند الوصول إلى نهاية مراقي (آخر آية في البقرة).
 */
export function nextInMaraqi(surah: number, ayah: number): { surah: number; ayah: number } | null {
  const count = AYAH_COUNTS[surah] ?? 0;
  if (ayah < count) return { surah, ayah: ayah + 1 };
  const idx = ORDER_IDX.get(surah);
  if (idx == null) return null;
  const nextSurah = MARAQI_SURAH_ORDER[idx + 1];
  if (nextSurah == null) return null;
  return { surah: nextSurah, ayah: 1 };
}

/**
 * الموضع السابق (toSurah + toAyah) بحسب ترتيب مراقي.
 * يُرجع null عند الوصول إلى بداية مراقي (أوّل آية في الفاتحة).
 */
export function prevInMaraqi(surah: number, ayah: number): { surah: number; ayah: number } | null {
  if (ayah > 1) return { surah, ayah: ayah - 1 };
  const idx = ORDER_IDX.get(surah);
  if (idx == null || idx === 0) return null;
  const prevSurah = MARAQI_SURAH_ORDER[idx - 1];
  if (prevSurah == null) return null;
  const prevCount = AYAH_COUNTS[prevSurah] ?? 0;
  if (prevCount === 0) return null;
  return { surah: prevSurah, ayah: prevCount };
}
