import { BadgeCategory, BadgeConditionKind, MuddakirDayStatus, MuddakirPhase, ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { studentStreak } from "../gamification/day-marks";
import { evaluateBadges } from "../gamification/evaluator";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ل٤ (§٤/§٥): مصدر السلسلة من MuddakirDay (مملوءٌ تقويميّاً)، ومُقيّم الأوسمة (منحٌ مرّةً واحدة).

const NOW = new Date("2026-05-20T09:00:00.000Z"); // يومٌ مكّيّ = 2026-05-20
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = "2026-05-20";

async function muddakirStudent() {
  await createProgram(prisma, ProgramKey.MUDDAKIR);
  const { student } = await createStudent(prisma);
  return student;
}
async function seedDays(studentId: string, seq: [string, MuddakirDayStatus][]) {
  await prisma.muddakirDay.createMany({ data: seq.map(([date, status]) => ({ studentId, dayDate: new Date(`${date}T00:00:00.000Z`), status })) });
}

describe("studentStreak — من أيّام المدّكر (مملوءٌ تقويميّاً)", () => {
  it("سبعة أيّام متتالية إتمام ⟵ ٧", async () => {
    const s = await muddakirStudent();
    await seedDays(s.id, Array.from({ length: 7 }, (_, i) => [addDays(TODAY, -6 + i), MuddakirDayStatus.COMPLETE] as [string, MuddakirDayStatus]));
    expect((await studentStreak(s.id, prisma, NOW)).current).toBe(7);
  });

  it("يومٌ ماضٍ بلا سجلٍّ = تقصيرٌ يقطع", async () => {
    const s = await muddakirStudent();
    // إتمام أمس واليوم، لكن ثلاثة أيّامٍ قبلُ إتمام ثمّ فجوةٌ (يومٌ غائب) ⟵ تنكسر عند الفجوة
    await seedDays(s.id, [
      [addDays(TODAY, -5), MuddakirDayStatus.COMPLETE],
      // -4 غائب (تقصير)
      [addDays(TODAY, -3), MuddakirDayStatus.COMPLETE],
      [addDays(TODAY, -2), MuddakirDayStatus.COMPLETE],
      [addDays(TODAY, -1), MuddakirDayStatus.COMPLETE],
      [TODAY, MuddakirDayStatus.COMPLETE],
    ]);
    expect((await studentStreak(s.id, prisma, NOW)).current).toBe(4); // -3,-2,-1,today
  });

  it("العذر يجسُر والقضاء يحفظ", async () => {
    const s = await muddakirStudent();
    await seedDays(s.id, [
      [addDays(TODAY, -3), MuddakirDayStatus.COMPLETE],
      [addDays(TODAY, -2), MuddakirDayStatus.EXCUSED],
      [addDays(TODAY, -1), MuddakirDayStatus.MADE_UP],
      [TODAY, MuddakirDayStatus.COMPLETE],
    ]);
    // C, (عذر يجسُر), MADE_UP=إتمام, C ⟵ ٣ إتمامات
    expect((await studentStreak(s.id, prisma, NOW)).current).toBe(3);
  });
});

async function seedDef(code: string, kind: BadgeConditionKind, threshold: number | null = null) {
  return prisma.badgeDefinition.create({ data: { code, kind, threshold, category: BadgeCategory.REGULARITY, nameAr: code, descAr: code, active: true, sortOrder: 0 } });
}

describe("evaluateBadges — منحٌ بالشرط، مرّةً واحدة", () => {
  it("سلسلة ٧ تُمنَح عند بلوغها، ولا تتكرّر", async () => {
    const s = await muddakirStudent();
    await seedDef("STREAK_7", BadgeConditionKind.STREAK_DAYS, 7);
    await seedDays(s.id, Array.from({ length: 7 }, (_, i) => [addDays(TODAY, -6 + i), MuddakirDayStatus.COMPLETE] as [string, MuddakirDayStatus]));
    expect(await evaluateBadges(prisma, s.id, NOW)).toContain("STREAK_7");
    expect(await evaluateBadges(prisma, s.id, NOW)).toEqual([]); // لا تكرار
    expect(await prisma.badgeGrant.count({ where: { studentId: s.id } })).toBe(1);
  });

  it("أقلّ من العتبة لا يُمنَح", async () => {
    const s = await muddakirStudent();
    await seedDef("STREAK_7", BadgeConditionKind.STREAK_DAYS, 7);
    await seedDays(s.id, [[addDays(TODAY, -1), MuddakirDayStatus.COMPLETE], [TODAY, MuddakirDayStatus.COMPLETE]]);
    expect(await evaluateBadges(prisma, s.id, NOW)).toEqual([]);
  });

  it("شهادة التثبيت تُمنَح في الطور الدائم؛ والإتقان بلا خطأ لا يُمنَح بعد", async () => {
    const s = await muddakirStudent();
    await prisma.muddakirProfile.create({ data: { studentId: s.id, track: 1, phase: MuddakirPhase.PERMANENT } });
    await seedDef("TATHBIT_CERT", BadgeConditionKind.TATHBIT_CERTIFICATE);
    await seedDef("HIFZ_KHATM", BadgeConditionKind.HIFZ_KHATM);
    await seedDef("WEEK_CLEAN", BadgeConditionKind.WEEK_NO_ERROR);
    const awarded = await evaluateBadges(prisma, s.id, NOW);
    expect(awarded).toEqual(expect.arrayContaining(["TATHBIT_CERT", "HIFZ_KHATM"]));
    expect(awarded).not.toContain("WEEK_CLEAN"); // معيار الإتقان بلا خطأ لم يُثبَّت بعد
  });
});
