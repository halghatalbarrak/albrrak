/** تطبيعٌ للمطابقة: يزيل التشكيل والتطويل، ويوحّد الهمزات والتاء المربوطة والألف المقصورة، ويحوّل الأرقام المشرقية. */
export function normalizeArabic(s: string): string {
  return (s ?? "")
    .replace(/[ً-ْٰ]/g, "") // تشكيل
    .replace(/ـ/g, "") // تطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
