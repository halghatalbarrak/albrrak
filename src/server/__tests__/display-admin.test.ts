import { DisplayAssetType, DisplayScreenKind, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createScreen } from "../display/screens";
import { addBackground, addImageSlide, addProgramSlide, getScreenDetail, reorderSlides } from "../display/admin";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ش٣: إدارة الشاشات — حرّاس الصلاحيّة، الترتيب، والخلفيّة append-only.

const admin = () => createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
const mosque = () => createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "مسجد" }, prisma);

describe("حرّاس الصلاحيّة", () => {
  it("غير المدير يُرفَض من كل إجراء", async () => {
    const u = await createUser(prisma, { roles: [] });
    const s = await mosque();
    const prog = await createProgram(prisma, ProgramKey.MARAQI);
    await expect(addProgramSlide(u.id, s.id, prog.id, undefined, prisma)).rejects.toThrow();
    await expect(addImageSlide(u.id, s.id, "https://x/y.webp", undefined, prisma)).rejects.toThrow();
    await expect(addBackground(u.id, DisplayScreenKind.MOSQUE, "https://x/bg.webp", DisplayAssetType.IMAGE, prisma)).rejects.toThrow();
  });
});

describe("الشرائح والترتيب", () => {
  it("تُضاف بترتيبٍ متتالٍ، وإعادة الترتيب تُحدّث ordinal", async () => {
    const a = await admin();
    const s = await mosque();
    const prog = await createProgram(prisma, ProgramKey.MARAQI);
    const s1 = await addProgramSlide(a.id, s.id, prog.id, undefined, prisma);
    const s2 = await addImageSlide(a.id, s.id, "https://x/a.webp", 15, prisma);
    const s3 = await addImageSlide(a.id, s.id, "https://x/b.webp", undefined, prisma);
    let d = (await getScreenDetail(s.id, prisma))!;
    expect(d.slides.map((x) => x.id)).toEqual([s1.id, s2.id, s3.id]);
    expect(d.slides[1].durationSec).toBe(15);

    await reorderSlides(a.id, s.id, [s3.id, s1.id, s2.id], prisma);
    d = (await getScreenDetail(s.id, prisma))!;
    expect(d.slides.map((x) => x.id)).toEqual([s3.id, s1.id, s2.id]);
    expect(d.slides.map((x) => x.ordinal)).toEqual([0, 1, 2]);
  });
});

describe("الخلفيّة append-only", () => {
  it("رفعُ خلفيّةٍ جديدة يعطّل السابقة ويُبقي مفعّلةً واحدة", async () => {
    const a = await admin();
    await addBackground(a.id, DisplayScreenKind.MOSQUE, "https://x/bg1.webp", DisplayAssetType.IMAGE, prisma);
    await addBackground(a.id, DisplayScreenKind.MOSQUE, "https://x/bg2.webp", DisplayAssetType.IMAGE, prisma);
    expect(await prisma.displayBackground.count({ where: { screenKind: DisplayScreenKind.MOSQUE } })).toBe(2); // لا حذف
    const active = await prisma.displayBackground.findMany({ where: { screenKind: DisplayScreenKind.MOSQUE, active: true } });
    expect(active).toHaveLength(1);
    expect(active[0].assetUrl).toBe("https://x/bg2.webp"); // الأحدث
  });
});
