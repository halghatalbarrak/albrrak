// ترتيب حفظ مراقي — مفتاحٌ نقيٌّ (بلا خادم)، يصلح للعميل والخادم.
// الفاتحة (١) أوّلاً، ثمّ الناس (١١٤) نزولاً حتى البقرة (٢).

/** ترتيب حفظ مراقي: الفاتحة ثمّ الناس (١١٤) نزولاً حتى البقرة (٢). */
export const MARAQI_SURAH_ORDER: number[] = [1, ...Array.from({ length: 113 }, (_, i) => 114 - i)];

const ORDER_INDEX = new Map(MARAQI_SURAH_ORDER.map((s, i) => [s, i]));

/** مفتاح ترتيبٍ بترتيب حفظ مراقي: موضع السورة (تنازليّ) ثمّ الآية (تصاعديّ). */
export function maraqiKey(surah: number, ayah: number): number {
  return (ORDER_INDEX.get(surah) ?? 999) * 100_000 + ayah;
}
