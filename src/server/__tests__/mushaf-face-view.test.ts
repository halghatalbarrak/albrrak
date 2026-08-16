import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getFace } from "../mushaf";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("عرض الوجه (الحكم ٧، المرحلة ٤)", () => {
  it("الوجه ٦٠٤ ⟵ رابط SVG + آياته الصحيحة (الإخلاص+الفلق+الناس = ١٥ آية)", async () => {
    await seedMushafFaces(prisma);
    const f = await getFace(604, prisma);
    expect(f.svgUrl).toContain("604.svg");
    expect(f.ayahs).toHaveLength(15); // ٤ + ٥ + ٦
    expect(f.ayahs[0]).toEqual({ surah: 112, ayah: 1 });
    expect(f.ayahs.at(-1)).toEqual({ surah: 114, ayah: 6 });
    // الآيات مشتقّةٌ من حدود MushafFace.
    expect([f.fromSurah, f.fromAyah, f.toSurah, f.toAyah]).toEqual([112, 1, 114, 6]);
  });

  it("وجهٌ متعدّد السور يعدّ آياته عبر حدود السور صحيحًا", async () => {
    await seedMushafFaces(prisma);
    const f = await getFace(1, prisma); // الفاتحة كاملةً (٧ آيات)
    expect(f.ayahs).toHaveLength(7);
    expect(f.ayahs.every((a) => a.surah === 1)).toBe(true);
  });

  it("وجهٌ غير موجود ⟵ يُرفض", async () => {
    await seedMushafFaces(prisma);
    await expect(getFace(9999, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});
