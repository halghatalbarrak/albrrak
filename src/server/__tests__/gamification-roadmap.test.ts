import { MuddakirPhase, ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildStations, muddakirRoadmap } from "../gamification/roadmap";
import { enrollInMuddakir } from "../muddakir-enrollment";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, seedHizbBoundaries, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ل٣ (§٢): محوّلات الخريطة — done/current/locked وتقدّم الحاليّة، قراءةً من المنطق القائم.

describe("buildStations — إسباغ الحالات (نقيّ)", () => {
  const E = [{ key: "a", label: "أ" }, { key: "b", label: "ب", progress: { done: 2, total: 5 } }, { key: "c", label: "ج" }];

  it("ما قبل الحاليّة مُنجَز، وعندها الحاليّة بتقدّمها، وبعدها مقفل", () => {
    const s = buildStations(E, 1);
    expect(s.map((x) => x.state)).toEqual(["DONE", "CURRENT", "LOCKED"]);
    expect(s[1].progress).toEqual({ done: 2, total: 5 });
    expect(s[0].progress).toBeUndefined(); // التقدّم على الحاليّة وحدها
  });

  it("currentIndex = 0 ⟵ الأولى حاليّة والباقي مقفل", () => {
    expect(buildStations(E, 0).map((x) => x.state)).toEqual(["CURRENT", "LOCKED", "LOCKED"]);
  });

  it("currentIndex ≥ الطول ⟵ الكلّ مُنجَز (تخرّج)", () => {
    expect(buildStations(E, 3).map((x) => x.state)).toEqual(["DONE", "DONE", "DONE"]);
  });
});

// ── تكامل: محوّل المدّكر من حالةٍ مبذورة ──

const LADDER = [
  [1, 1, 30, 3], [2, 2, 15, 2], [3, 3, 10, 3], [4, 4, 8, 4], [5, 5, 6, 5],
  [6, 6, 5, 6], [7, 7, 5, 7], [8, 8, 4, 8], [9, 9, 4, 9], [10, 10, 3, 10],
] as const;

async function muddakirStudentAtStage2() {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const def: Record<string, unknown> = { newReps: 5, firstCleanReps: 3, yesterdayReps: 10, ribatWindowDays: { "1": 20, "2": 15, "3": 10 }, reviewCycleDays: 7, tracks: [1, 2, 3], stageJuzCount: 5 };
  await prisma.setting.createMany({ data: Object.entries(def).map(([key, value]) => ({ programId: mud.id, key, value: value as never })) });
  await seedHizbBoundaries(prisma);
  await seedMushafFaces(prisma);
  await prisma.muddakirTathbitDegree.createMany({ data: LADDER.map(([degreeNo, dailyJuz, khatmaDays, khatmaCount]) => ({ degreeNo, dailyJuz, khatmaDays, khatmaCount })) });
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { phase: MuddakirPhase.MEMORIZE, currentStageId: "2" } });
  return student;
}

describe("muddakirRoadmap — المراحل ثمّ الدرجات ثمّ الدائم", () => {
  it("في المرحلة ٢ (حفظ): الأولى مُنجَزة، الثانية حاليّة بتقدّمها، وما بعدها مقفل", async () => {
    const student = await muddakirStudentAtStage2();
    const rm = (await muddakirRoadmap(student.id, prisma))!;
    expect(rm).not.toBeNull();
    expect(rm.programKey).toBe("MUDDAKIR");
    // ٦ مراحل + ١٠ درجات + الورد الدائم = ١٧ محطّة.
    expect(rm.stations).toHaveLength(17);
    expect(rm.currentKey).toBe("stage-2");
    expect(rm.stations[0].state).toBe("DONE");   // المرحلة ١
    expect(rm.stations[1].state).toBe("CURRENT"); // المرحلة ٢
    expect(rm.stations[1].progress?.total).toBeGreaterThan(0);
    expect(rm.stations[2].state).toBe("LOCKED");  // المرحلة ٣
    expect(rm.stations[6].key).toBe("degree-1");
    expect(rm.stations[6].state).toBe("LOCKED");  // الدرجات مقفلة
    expect(rm.stations[16].key).toBe("permanent");
    expect(rm.stations[16].state).toBe("LOCKED"); // الورد الدائم مقفل
  });

  it("لا ملفَّ مُدَّكِرٍ ⟵ null", async () => {
    const { student } = await createStudent(prisma);
    expect(await muddakirRoadmap(student.id, prisma)).toBeNull();
  });
});
