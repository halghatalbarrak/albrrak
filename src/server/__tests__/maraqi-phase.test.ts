import { ProgramKey, StageKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { loadMaraqiPhases, phaseForFrontier } from "../maraqi-phase";
import { maraqiKey } from "@/lib/maraqi-order";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// الحدود الستّ (القرار أ). آخر الآيات تُبذَر هنا مرجعاً مستقلّاً عبر MushafFace (وجهُ نهاية السورة)
// ليُقارَن بها حدُّ المرحلة — لا رقمٌ مكتوبٌ في منطق المراحل.
const BOUNDS = [
  { ord: 1, from: [1, 1], end: [46, 35] },
  { ord: 2, from: [45, 1], end: [29, 69] },
  { ord: 3, from: [28, 1], end: [18, 110] },
  { ord: 4, from: [17, 1], end: [10, 109] },
  { ord: 5, from: [9, 1], end: [5, 120] },
  { ord: 6, from: [4, 1], end: [2, 286] },
];

async function seedPhases() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  let page = 594;
  for (const b of BOUNDS) {
    await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: b.ord, nameAr: `مرحلة ${b.ord}`, fromSurah: b.from[0], fromAyah: b.from[1], toSurah: b.end[0], toAyah: b.end[1] },
    });
    // وجهُ نهاية سورة الحدّ (مرجع المصحف المستقلّ).
    await prisma.mushafFace.create({ data: { page: page++, fromSurah: b.end[0], fromAyah: 1, toSurah: b.end[0], toAyah: b.end[1] } });
  }
  return program;
}

describe("خريطة المراحل بحدود السور (مراقي ٢، القرار أ)", () => {
  it("المراحل الستّ = سور الحدّ بترتيبها، وآخر آيةٍ تطابق بيانات المصحف (MushafFace)", async () => {
    await seedPhases();
    const phases = await loadMaraqiPhases(prisma);
    expect(phases.map((p) => p.toSurah)).toEqual([46, 29, 18, 10, 5, 2]);
    for (const p of phases) {
      const faces = await prisma.mushafFace.findMany({ where: { toSurah: p.toSurah }, select: { toAyah: true } });
      expect(p.toAyah).toBe(Math.max(...faces.map((f) => f.toAyah))); // حدُّ المرحلة = آخر آية السورة في المصحف
    }
  });

  it("المرحلة الحاليّة تُحسب من الجبهة: عند الحدّ تبقى فيها، وبتجاوزه تنتقل", async () => {
    await seedPhases();
    const phases = await loadMaraqiPhases(prisma);
    expect(phaseForFrontier(null, phases)!.ordinal).toBe(1); // لم يبدأ
    expect(phaseForFrontier(maraqiKey(114, 6), phases)!.ordinal).toBe(1); // أوّل الحفظ (الناس)
    expect(phaseForFrontier(maraqiKey(46, 35), phases)!.ordinal).toBe(1); // عند حدّ المرحلة ١ (الأحقاف) — يبقى فيها
    expect(phaseForFrontier(maraqiKey(45, 1), phases)!.ordinal).toBe(2); // تجاوزه (الجاثية) — المرحلة ٢
    expect(phaseForFrontier(maraqiKey(29, 69), phases)!.ordinal).toBe(2); // حدّ المرحلة ٢ (العنكبوت)
    expect(phaseForFrontier(maraqiKey(2, 286), phases)!.ordinal).toBe(6); // الختم — المرحلة ٦
  });
});
