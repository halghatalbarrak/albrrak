import { ProgramKey, StageKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getHizbFaces } from "../hasad";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("أوجه الحزب للشاشة (الحكم ٧، المرحلة ٥)", () => {
  it("حزب ٦٠ ⟵ أوجهه ٥٩١..٦٠٤ مرتّبةً", async () => {
    await seedMushafFaces(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const main = await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية" },
    });
    const h60 = await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "الأعلى 1 - الناس 6", parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6 },
    });
    const f = await getHizbFaces(h60.id, prisma);
    expect(f.hizbNumber).toBe(60);
    expect(f.stageLabel).toBe("الأعلى 1 - الناس 6");
    expect(f.pages[0]).toBe(591);
    expect(f.pages.at(-1)).toBe(604);
    // متتالية ومرتّبة
    expect(f.pages).toEqual([...f.pages].sort((a, b) => a - b));
  });

  it("مرحلةٌ غير موجودة ⟵ يُرفض", async () => {
    await seedMushafFaces(prisma);
    await expect(getHizbFaces("nope", prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});
