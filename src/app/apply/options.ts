// تحليل استجابة /api/registration-options إلى شكلٍ آمن — مصفوفات دائمًا.
// يمنع بنيةً انهيار `.map على undefined` مهما كان شكل الرد (خطأ/ناقص/فارغ).

export interface OptionItem {
  id: string;
  nameAr: string;
}
export interface Options {
  nationalities: OptionItem[];
  schoolStages: OptionItem[];
}

function toItems(v: unknown): OptionItem[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is OptionItem =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as OptionItem).id === "string" &&
      typeof (x as OptionItem).nameAr === "string",
  );
}

export function parseOptions(json: unknown): Options {
  const o = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  return {
    nationalities: toItems(o.nationalities),
    schoolStages: toItems(o.schoolStages),
  };
}
