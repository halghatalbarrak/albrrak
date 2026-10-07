import { MuddakirPhase, ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hafizHomeForUser } from "../muddakir-today-view";
import { ingestEvents, type DeviceEvent } from "../muddakir-events";
import { ensureMuddakirProfile } from "../muddakir-profile";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, seedHizbBoundaries } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ت٤ (§١٢): بيت الحافظ يتفرّع على الطور، والورد يعمل بلا إنترنت (أحداث WARD_COMPLETE عبر نفس
// مسار الأحداث). تعديل ٣: لا مواضع مفاجئة في أيّ استجابةٍ يقرؤها الحافظ.

const NOW = new Date("2026-06-02T09:00:00.000Z");
const LADDER = [[1, 1, 30, 3], [2, 2, 15, 2], [3, 3, 10, 3], [4, 4, 8, 4], [5, 5, 6, 5], [6, 6, 5, 6], [7, 7, 5, 7], [8, 8, 4, 8], [9, 9, 4, 9], [10, 10, 3, 10]] as const;

async function tathbitHafiz() {
  await createProgram(prisma, ProgramKey.MUDDAKIR);
  await seedHizbBoundaries(prisma);
  await prisma.muddakirTathbitDegree.createMany({ data: LADDER.map(([degreeNo, dailyJuz, khatmaDays, khatmaCount]) => ({ degreeNo, dailyJuz, khatmaDays, khatmaCount })) });
  const { user, student } = await createStudent(prisma);
  await ensureMuddakirProfile(prisma, student.id);
  await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { phase: MuddakirPhase.TATHBIT, tathbitDegree: 1 } });
  await prisma.muddakirRecitation.create({ data: { studentId: student.id, kind: "FINAL", stage: 6, passed: true, examinerId: "ex", recitedOn: new Date("2026-06-01T00:00:00.000Z") } });
  return { user, student };
}

const ev = (clientEventId: string, type: string, occurredAt: string): DeviceEvent => ({ clientEventId, type, occurredAt });

describe("بيت الحافظ بحسب الطور (§١٢)", () => {
  it("التثبيت ⟵ وردٌ بحدوده، بلا خطّة حفظ، وبلا أيّ مواضع مفاجئة (تعديل ٣)", async () => {
    const { user } = await tathbitHafiz();
    const home = await hafizHomeForUser(user.id, prisma, NOW);
    expect(home.phase).toBe("TATHBIT");
    expect(home.ward).toBeTruthy();
    expect(home.ward!.wards.length).toBeGreaterThanOrEqual(1);
    expect(home.ward!.wards[0]).toMatchObject({ fromJuz: 1, fromSurah: 1, fromAyah: 1 });
    // تعديل ٣: لا شيء خاصٌّ بالمشرف (surprise) في استجابة الحافظ.
    expect(JSON.stringify(home).toLowerCase()).not.toContain("surprise");
    expect(JSON.stringify(home)).not.toContain("مفاجئ");
  });

  it("إتمام الورد عبر حدث WARD_COMPLETE (مسار الأحداث نفسه) يُقدّم المؤشّر — idempotent", async () => {
    const { user, student } = await tathbitHafiz();
    const r = await ingestEvents({ actorUserId: user.id, events: [ev("w1", "WARD_COMPLETE", "2026-06-02T09:00:00.000Z")] }, prisma, NOW);
    expect(r.accepted).toBe(1);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).wardsCompleted).toBe(1);
    // تكرار الحدث لا يُقدّم المؤشّر (idempotent على clientEventId).
    await ingestEvents({ actorUserId: user.id, events: [ev("w1", "WARD_COMPLETE", "2026-06-02T09:00:00.000Z")] }, prisma, NOW);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).wardsCompleted).toBe(1);
  });

  it("الحفظ (MEMORIZE) ⟵ الخطّة لا الورد", async () => {
    await createProgram(prisma, ProgramKey.MUDDAKIR);
    const { user, student } = await createStudent(prisma);
    await ensureMuddakirProfile(prisma, student.id);
    const home = await hafizHomeForUser(user.id, prisma, NOW);
    expect(home.phase).toBe("MEMORIZE");
    expect(home.ward).toBeNull();
    expect(student.id).toBeTruthy();
  });
});
