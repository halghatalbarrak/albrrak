import { BadgeCategory, BadgeConditionKind, MuddakirErrorSource, MuddakirFaceState, MuddakirRecitationKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { evaluateBadges } from "../gamification/evaluator";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ل٧ (§٥): أوسمة الإتقان بلا خطأ — تُحسب أخطاء المشرف/المختبِر وحدها، لا أخطاء الحافظ الذاتيّة
// (repErrors وRIBAT/REVIEW) كيلا يُكافأ إخفاء الخطأ.

const NOW = new Date("2026-05-20T09:00:00.000Z");
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
const seedDef = (code: string, kind: BadgeConditionKind, threshold: number | null = null) =>
  prisma.badgeDefinition.create({ data: { code, kind, threshold, category: BadgeCategory.MASTERY, nameAr: code, descAr: code, active: true, sortOrder: 0 } });
const err = (studentId: string, source: MuddakirErrorSource, page: number, openedOn: string) =>
  prisma.muddakirError.create({ data: { studentId, page, lineNo: 1, source, openedOn: date(openedOn) } });

describe("WEEK_NO_ERROR — أسبوع بلا خطأ مشرف", () => {
  it("أخطاء الحافظ الذاتيّة (RIBAT/REVIEW/repErrors) لا تمنع الوسام", async () => {
    const { student } = await createStudent(prisma);
    await seedDef("WEEK_CLEAN", BadgeConditionKind.WEEK_NO_ERROR);
    await prisma.muddakirWeek.create({ data: { studentId: student.id, weekStart: date("2026-05-04"), regularityConfirmedAt: NOW } });
    await err(student.id, MuddakirErrorSource.RIBAT, 1, "2026-05-05");
    await err(student.id, MuddakirErrorSource.REVIEW, 2, "2026-05-06");
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 1, state: MuddakirFaceState.HEARD, repErrors: 9, heardAt: NOW } });
    expect(await evaluateBadges(prisma, student.id, NOW)).toContain("WEEK_CLEAN");
  });

  it("خطأ مشرفٍ في الأسبوع (ولو عولج) يُسقط الوسام", async () => {
    const { student } = await createStudent(prisma);
    await seedDef("WEEK_CLEAN", BadgeConditionKind.WEEK_NO_ERROR);
    await prisma.muddakirWeek.create({ data: { studentId: student.id, weekStart: date("2026-05-04"), regularityConfirmedAt: NOW } });
    await prisma.muddakirError.create({ data: { studentId: student.id, page: 3, lineNo: 1, source: MuddakirErrorSource.SUPERVISOR, openedOn: date("2026-05-05"), resolvedAt: NOW } });
    expect(await evaluateBadges(prisma, student.id, NOW)).not.toContain("WEEK_CLEAN");
  });
});

describe("STAGE_RECITATION_NO_ERROR — سرد مرحلة بلا خطأ مختبِر", () => {
  it("أخطاء الحافظ الذاتيّة في يوم السرد لا تمنعه؛ وخطأ المختبِر يمنعه", async () => {
    const a = await createStudent(prisma);
    await seedDef("RECITE_CLEAN", BadgeConditionKind.STAGE_RECITATION_NO_ERROR);
    await prisma.muddakirRecitation.create({ data: { studentId: a.student.id, kind: MuddakirRecitationKind.STAGE, stage: 1, passed: true, examinerId: "ex", recitedOn: date("2026-05-10") } });
    await err(a.student.id, MuddakirErrorSource.RIBAT, 5, "2026-05-10"); // ذاتيّ، لا يمنع
    expect(await evaluateBadges(prisma, a.student.id, NOW)).toContain("RECITE_CLEAN");

    const b = await createStudent(prisma);
    await prisma.muddakirRecitation.create({ data: { studentId: b.student.id, kind: MuddakirRecitationKind.STAGE, stage: 1, passed: true, examinerId: "ex", recitedOn: date("2026-05-10") } });
    await err(b.student.id, MuddakirErrorSource.EXAMINER, 5, "2026-05-10"); // خطأ مختبِرٍ في اليوم نفسه
    expect(await evaluateBadges(prisma, b.student.id, NOW)).not.toContain("RECITE_CLEAN");
  });
});

describe("FACES_HEARD_NO_ERROR — ١٠ أوجه مسموعة بلا خطأ مشرف", () => {
  async function tenHeard(studentId: string) {
    await prisma.muddakirFace.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ studentId, page: i + 1, state: MuddakirFaceState.HEARD, heardAt: NOW, repErrors: i % 3 })) }); // repErrors متفاوتة
  }
  it("repErrors وأخطاء RIBAT لا تُنقص العدّ ⟵ يُمنَح بعشرة أوجه", async () => {
    const { student } = await createStudent(prisma);
    await seedDef("FACES_10", BadgeConditionKind.FACES_HEARD_NO_ERROR, 10);
    await tenHeard(student.id);
    await err(student.id, MuddakirErrorSource.RIBAT, 4, "2026-05-01"); // ذاتيّ على وجهٍ مسموع — لا يُنقص
    expect(await evaluateBadges(prisma, student.id, NOW)).toContain("FACES_10");
  });

  it("خطأ مشرفٍ على وجهٍ يُخرجه من العدّ ⟵ تسعةٌ نظيفة لا تكفي", async () => {
    const { student } = await createStudent(prisma);
    await seedDef("FACES_10", BadgeConditionKind.FACES_HEARD_NO_ERROR, 10);
    await tenHeard(student.id);
    await err(student.id, MuddakirErrorSource.SUPERVISOR, 3, "2026-05-01"); // يُخرج الوجه ٣
    expect(await evaluateBadges(prisma, student.id, NOW)).not.toContain("FACES_10");
  });
});
