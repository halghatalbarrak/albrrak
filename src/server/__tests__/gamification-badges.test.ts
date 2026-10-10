import { BadgeCategory, BadgeConditionKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { awardBadge, listBadgeDefinitions, listStudentBadges } from "../gamification/badges";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ل١ (§٥): الوسام يُمنح مرّةً واحدة (idempotent)، بلا سحب. resetDb يفرّغ التعريفات المبذورة
// بالترحيل، فتُبذر داخل الاختبار (كعادة البيانات المرجعيّة).
let defSeq = 0;
async function seedDef(over: Partial<{ code: string; active: boolean; kind: BadgeConditionKind; category: BadgeCategory }> = {}) {
  return prisma.badgeDefinition.create({
    data: {
      code: over.code ?? `DEF_${defSeq++}`,
      kind: over.kind ?? BadgeConditionKind.STREAK_DAYS,
      threshold: 7,
      category: over.category ?? BadgeCategory.REGULARITY,
      nameAr: "سلسلة ٧ أيّام",
      descAr: "إتمام اليوم سبعة أيّامٍ متتالية.",
      emoji: "🔥",
      active: over.active ?? true,
      sortOrder: 10,
    },
  });
}

describe("awardBadge — منحٌ مرّةً واحدة بلا سحب", () => {
  it("المنح الأوّل ينجح، والثاني لا يُكرّر، وحدثٌ واحدٌ فقط", async () => {
    const def = await seedDef();
    const { student } = await createStudent(prisma);
    const first = await awardBadge(prisma, { studentId: student.id, badgeDefId: def.id, sourceEvent: "MUDDAKIR_DAY_COMPLETE", sourceRef: "d1" });
    expect(first).not.toBeNull();
    const second = await awardBadge(prisma, { studentId: student.id, badgeDefId: def.id, sourceEvent: "MUDDAKIR_DAY_COMPLETE", sourceRef: "d2" });
    expect(second).toBeNull();
    expect(await prisma.badgeGrant.count({ where: { studentId: student.id, badgeDefId: def.id } })).toBe(1);
    expect(await prisma.event.count({ where: { type: "BADGE_AWARDED", subjectId: student.id } })).toBe(1);
  });

  it("طالبان مختلفان: لكلٍّ وسامه من التعريف نفسه", async () => {
    const def = await seedDef();
    const a = await createStudent(prisma);
    const b = await createStudent(prisma);
    expect(await awardBadge(prisma, { studentId: a.student.id, badgeDefId: def.id, sourceEvent: "X" })).not.toBeNull();
    expect(await awardBadge(prisma, { studentId: b.student.id, badgeDefId: def.id, sourceEvent: "X" })).not.toBeNull();
    expect(await prisma.badgeGrant.count({ where: { badgeDefId: def.id } })).toBe(2);
  });
});

describe("قراءة الأوسمة والتعريفات", () => {
  it("listStudentBadges يُرجع الوسام المكتسب بتعريفه", async () => {
    const def = await seedDef({ code: "STAGE_X", kind: BadgeConditionKind.STAGE_COMPLETE, category: BadgeCategory.ACHIEVEMENT });
    const { student } = await createStudent(prisma);
    await awardBadge(prisma, { studentId: student.id, badgeDefId: def.id, sourceEvent: "MUDDAKIR_STAGE_COMPLETE" });
    const badges = await listStudentBadges(student.id);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ code: "STAGE_X", kind: BadgeConditionKind.STAGE_COMPLETE, nameAr: "سلسلة ٧ أيّام" });
  });

  it("listBadgeDefinitions مع activeOnly يقصرها على المفعّلة", async () => {
    await seedDef({ code: "ON_1", active: true });
    await seedDef({ code: "OFF_1", active: false });
    expect(await listBadgeDefinitions(prisma)).toHaveLength(2);
    const active = await listBadgeDefinitions(prisma, { activeOnly: true });
    expect(active).toHaveLength(1);
    expect(active[0].code).toBe("ON_1");
  });
});
