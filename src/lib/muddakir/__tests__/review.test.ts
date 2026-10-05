import { describe, expect, it } from "vitest";

import { reviewSliceForDay, type ReviewFaceInput } from "../review";

const plusDay = (iso: string, d: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

// أوجه مراجعةٍ بترتيبٍ مُبعثَرٍ عمداً للتأكّد من الترتيب بترتيب المصحف داخليّاً.
const shuffled = (n: number): ReviewFaceInput[] =>
  Array.from({ length: n }, (_, i) => ({ page: n - i }));

describe("reviewSliceForDay — توزيع ختمة ٧ أيّام", () => {
  it("١٤ وجهاً على ٧ أيّام = وجهان كل يوم، وتكتمل الختمة بترتيب المصحف بلا تكرار", () => {
    const faces = shuffled(14);
    const cycle = 7;
    const base = "2026-10-04";
    const byIndex = new Map<number, number[]>();
    for (let d = 0; d < cycle; d++) {
      const today = plusDay(base, d);
      const slice = reviewSliceForDay(faces, cycle, today).map((f) => f.page);
      expect(slice.length).toBe(2); // ١٤ / ٧ = وجهان
      const idx = (Date.parse(`${today}T00:00:00Z`) / 86_400_000) % cycle;
      byIndex.set(idx, slice);
    }
    // تجميع الشرائح بترتيب الدورة = المصحف كلّه مرّةً واحدة ١..١٤.
    const union = [...byIndex.keys()].sort((a, b) => a - b).flatMap((k) => byIndex.get(k)!);
    expect(union).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it("توزيعٌ متوازنٌ عند عدم القسمة (١٠ على ٧): الأُولى تأخذ الزائد، والختمة كاملة", () => {
    const faces = shuffled(10);
    const cycle = 7;
    const base = "2026-10-04";
    const sizes: number[] = [];
    const union: number[] = [];
    for (let d = 0; d < cycle; d++) {
      const slice = reviewSliceForDay(faces, cycle, plusDay(base, d)).map((f) => f.page);
      sizes.push(slice.length);
    }
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10); // لا فقدان ولا تكرار
    expect(sizes.filter((s) => s === 2).length).toBe(3); // ثلاث شرائح بوجهين
    expect(sizes.filter((s) => s === 1).length).toBe(4); // وأربعٌ بوجه
    // اكتمال الختمة بترتيب المصحف عبر الدورة.
    const byIndex = new Map<number, number[]>();
    for (let d = 0; d < cycle; d++) {
      const today = plusDay(base, d);
      byIndex.set((Date.parse(`${today}T00:00:00Z`) / 86_400_000) % cycle, reviewSliceForDay(faces, cycle, today).map((f) => f.page));
    }
    [...byIndex.keys()].sort((a, b) => a - b).forEach((k) => union.push(...byIndex.get(k)!));
    expect(union).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it("لا أوجه ⟵ شريحةٌ فارغة؛ ويرفض دورةً أقلّ من ١", () => {
    expect(reviewSliceForDay([], 7, "2026-10-04")).toEqual([]);
    expect(() => reviewSliceForDay(shuffled(3), 0, "2026-10-04")).toThrow();
  });
});
