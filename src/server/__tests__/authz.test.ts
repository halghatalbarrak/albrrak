import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actorHasCapability } from "../authz";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("محرّك التفويض (§٣٫٣ — على مستوى الأدوار)", () => {
  it("المدير يفوّض «قبول العذر» للمعلم ← ينفذ بلا نشر", async () => {
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });

    // قبل التفويض: المعلم لا يملكها.
    expect(await actorHasCapability(teacher.id, "ABSENCE_EXCUSE")).toBe(false);

    // المدير يفوّضها لدور المعلم (سطرٌ في الجدول — لا كود ولا نشر).
    await prisma.permissionDelegation.create({
      data: {
        capability: "ABSENCE_EXCUSE",
        holderRole: Role.TEACHER,
        grantedBy: manager.id,
      },
    });

    // بعد التفويض: أيّ معلم يملكها.
    expect(await actorHasCapability(teacher.id, "ABSENCE_EXCUSE")).toBe(true);
    // والمدير يملكها أصالةً.
    expect(await actorHasCapability(manager.id, "ABSENCE_EXCUSE")).toBe(true);
  });

  it("سحب التفويض (revokedAt) ← تسقط الصلاحية", async () => {
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await prisma.permissionDelegation.create({
      data: {
        capability: "ABSENCE_EXCUSE",
        holderRole: Role.TEACHER,
        grantedBy: manager.id,
        revokedAt: new Date(),
      },
    });
    expect(await actorHasCapability(teacher.id, "ABSENCE_EXCUSE")).toBe(false);
  });
});
