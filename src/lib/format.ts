// اللغة البصريّة (الفكرة ٧): أرقامٌ هنديّة وتقويمٌ هجريّ للعرض.

const AR = "٠١٢٣٤٥٦٧٨٩";

/** يحوّل الأرقام اللاتينيّة إلى هنديّةٍ عربيّة (للعرض فقط). */
export const arNum = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => AR[Number(d)]);

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
