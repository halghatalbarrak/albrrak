import { BadgeCategory, BadgeConditionKind, MotivationKind, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { activeTemplatesMap, listMotivationTemplates, updateBadgeDefinition, updateMotivationTemplate } from "../gamification/admin";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ل٦ (§٥/§٦): المدير يعدّل تعريفات الأوسمة وقوالب التحفيز؛ غير المدير يُرفَض؛ لا حذف.

const admin = () => createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
const seedDef = () => prisma.badgeDefinition.create({ data: { code: "STREAK_7", kind: BadgeConditionKind.STREAK_DAYS, threshold: 7, category: BadgeCategory.REGULARITY, nameAr: "سلسلة ٧", descAr: "وصف", active: true, sortOrder: 0 } });

describe("updateBadgeDefinition", () => {
  it("المدير يعدّل الاسم والعتبة والتفعيل؛ النوع لا يُمسّ", async () => {
    const a = await admin();
    const def = await seedDef();
    await updateBadgeDefinition(a.id, def.id, { nameAr: "سلسلة الأسبوع", threshold: 10, active: false }, prisma);
    const row = await prisma.badgeDefinition.findUniqueOrThrow({ where: { id: def.id } });
    expect(row).toMatchObject({ nameAr: "سلسلة الأسبوع", threshold: 10, active: false, kind: BadgeConditionKind.STREAK_DAYS });
  });

  it("غير المدير يُرفَض", async () => {
    const u = await createUser(prisma, { roles: [] });
    const def = await seedDef();
    await expect(updateBadgeDefinition(u.id, def.id, { nameAr: "x" }, prisma)).rejects.toThrow();
  });

  it("عتبةٌ غير موجبة تُرفَض", async () => {
    const a = await admin();
    const def = await seedDef();
    await expect(updateBadgeDefinition(a.id, def.id, { threshold: 0 }, prisma)).rejects.toThrow();
  });
});

describe("قوالب التحفيز", () => {
  it("التحرير upsert، والخريطة تعكس النصّ المفعّل والمعطّل يسقط إلى فارغ", async () => {
    const a = await admin();
    await updateMotivationTemplate(a.id, MotivationKind.STREAK_AT_RISK, { textAr: "سلسلتك {days}! لا تقطعها" }, prisma);
    const rows = await listMotivationTemplates(prisma);
    expect(rows.find((r) => r.kind === MotivationKind.STREAK_AT_RISK)?.textAr).toBe("سلسلتك {days}! لا تقطعها");

    await updateMotivationTemplate(a.id, MotivationKind.FIRST_STEP, { active: false }, prisma);
    const map = await activeTemplatesMap(prisma);
    expect(map.STREAK_AT_RISK).toBe("سلسلتك {days}! لا تقطعها"); // المفعّل بنصّه
    expect(map.FIRST_STEP).toBe(""); // المعطّل يسقط فلا يظهر نوعه
  });

  it("listMotivationTemplates يُرجع كلّ الأنواع ولو لم تُبذَر (افتراض)", async () => {
    const rows = await listMotivationTemplates(prisma);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.textAr.length > 0)).toBe(true);
  });
});
