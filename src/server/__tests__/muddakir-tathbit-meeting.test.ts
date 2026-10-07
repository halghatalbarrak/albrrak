import { MuddakirPhase, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordWardComplete } from "../muddakir-ward";
import { raiseHafizDegree, supervisorHafizDetail } from "../muddakir-supervisor";
import { ensureMuddakirProfile } from "../muddakir-profile";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser, seedHizbBoundaries } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-06-02T09:00:00.000Z");

/** حافظٌ في التثبيت بسلّمٍ مخصوصٍ وإعداداتٍ، والبدء من اليوم (سردٌ ختاميٌّ أمسِ). */
async function tathbitHafiz(ladder: [number, number, number, number][], settings: Record<string, unknown> = {}) {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  await seedHizbBoundaries(prisma);
  await prisma.muddakirTathbitDegree.createMany({ data: ladder.map(([degreeNo, dailyJuz, khatmaDays, khatmaCount]) => ({ degreeNo, dailyJuz, khatmaDays, khatmaCount })) });
  for (const [key, value] of Object.entries(settings)) await prisma.setting.create({ data: { programId: mud.id, key, value: value as never } });
  const { student } = await createStudent(prisma);
  await ensureMuddakirProfile(prisma, student.id);
  await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { phase: MuddakirPhase.TATHBIT, tathbitDegree: 1 } });
  await prisma.muddakirRecitation.create({ data: { studentId: student.id, kind: "FINAL", stage: 6, passed: true, examinerId: "ex", recitedOn: new Date("2026-06-01T00:00:00.000Z") } });
  return student;
}

describe("الانتقال الآليّ بين الدرجات (§١٢)", () => {
  it("إتمام أوراد الدرجة ينقل آليّاً إلى التالية ويزيد عدّاد الختمات", async () => {
    // سلّمٌ مصغّر: الدرجة ١ = وردٌ واحد (٣٠ جزءاً/يوم، ختمةٌ واحدة) ⟵ إتمامُه ينقل إلى الدرجة ٢.
    const student = await tathbitHafiz([[1, 30, 1, 1], [2, 30, 1, 1]]);
    await recordWardComplete({ studentId: student.id, clientEventId: "w1", occurredAt: NOW }, prisma, NOW);
    const p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p.tathbitDegree).toBe(2);
    expect(p.cumulativeKhatmat).toBe(1);
  });
});

describe("الرفع المبكّر (§١٢)", () => {
  it("المشرف يرفع الحافظ قبل إتمام ختماته: قفزٌ للدرجة التالية مع تسجيل، لا نزول", async () => {
    const student = await tathbitHafiz([[1, 1, 30, 3], [2, 2, 15, 2]]); // الدرجة ١ = ٩٠ وردًا
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const r = await raiseHafizDegree({ actorUserId: manager.id, studentId: student.id }, prisma, NOW);
    expect(r).toMatchObject({ fromDegree: 1, toDegree: 2, atKhatma: 1 });
    const p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p.tathbitDegree).toBe(2);
    expect(p.wardsRaised).toBe(90); // أوراد ما بقي من الدرجة ١ قُفزت
    const log = await prisma.muddakirDegreeRaise.findMany({ where: { studentId: student.id } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ fromDegree: 1, toDegree: 2, bySupervisorId: manager.id });
  });

  it("الرفع يُرفض ممّن لا يشرف ولا يدير", async () => {
    const student = await tathbitHafiz([[1, 1, 30, 3], [2, 2, 15, 2]]);
    const stranger = await createUser(prisma, { roles: [Role.ARIF] }); // مشرفٌ بلا إسناد
    await expect(raiseHafizDegree({ actorUserId: stranger.id, studentId: student.id }, prisma, NOW)).rejects.toThrow();
  });
});

describe("المواضع المفاجئة (§١٢ + تعديل ٣): للمشرف فقط", () => {
  it("تظهر في تفصيل المشرف بقدر weeklySurpriseJuz، ضمن ١..٣٠، وثابتةٌ للأسبوع", async () => {
    const student = await tathbitHafiz([[1, 1, 30, 3], [2, 2, 15, 2]], { weeklySurpriseJuz: 2 });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const d = await supervisorHafizDetail(manager.id, student.id, prisma, NOW);
    expect(d.tathbit).toBeTruthy();
    expect(d.tathbit!.surprisePositions).toHaveLength(2);
    expect(d.tathbit!.surprisePositions.every((s) => s.juz >= 1 && s.juz <= 30)).toBe(true);
    // ثابتةٌ للأسبوع (نفس المعرّف + الأسبوع ⟵ نفس المواضع).
    const d2 = await supervisorHafizDetail(manager.id, student.id, prisma, NOW);
    expect(d2.tathbit!.surprisePositions.map((s) => s.juz)).toEqual(d.tathbit!.surprisePositions.map((s) => s.juz));
  });
});
