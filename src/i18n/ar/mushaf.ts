// قاموس نصوص شاشة المصحف — العربيّة. يُستدعى عبر tMushaf.

export const mushafAr = {
  prevFace: "الوجه السابق",
  nextFace: "الوجه التالي",
} as const;

export type MushafKey = keyof typeof mushafAr;

export function tMushaf(key: MushafKey): string {
  return mushafAr[key];
}
