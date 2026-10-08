import { MuddakirPhase, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordWardComplete, getWardView, recordTathbitFinal } from "../muddakir-ward";
import { approveTathbit } from "../muddakir-supervisor";
import { ensureMuddakirProfile } from "../muddakir-profile";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser, seedHizbBoundaries } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-06-02T09:00:00.000Z");

/** حافظٌ في التثبيت أنهى السلّم (سلّمٌ من درجةٍ واحدةٍ بوردٍ واحد)، والبدء من اليوم. */
async function finishedHafiz(settings: Record<string, unknown> = {}) {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  await seedHizbBoundaries(prisma);
  await prisma.muddakirTathbitDegree.create({ data: { degreeNo: 1, dailyJuz: 30, khatmaDays: 1, khatmaCount: 1 } }); // درجةٌ = وردٌ واحد
  for (const [k, v] of Object.entries(settings)) await prisma.setting.create({ data: { programId: mud.id, key: k, value: v as never } });
  const { student } = await createStudent(prisma);
  await ensureMuddakirProfile(prisma, student.id);
  await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { phase: MuddakirPhase.TATHBIT, tathbitDegree: 1 } });
  await prisma.muddakirRecitation.create({ data: { studentId: student.id, kind: "FINAL", stage: 6, passed: true, examinerId: "ex", recitedOn: new Date("2026-06-01T00:00:00.000Z") } });
  // إتمام ورد الدرجة الوحيد ⟵ انتهى السلّم.
  await recordWardComplete({ studentId: student.id, clientEventId: "w1", occurredAt: NOW }, prisma, NOW);
  return student;
}

describe("ختام التثبيت والورد الدائم (ت٦، §١٢)", () => {
  it("السرد الختاميّ لا يُصدِر الشهادة؛ الاعتماد وحده يُصدِرها وينقل للورد الدائم", async () => {
    const student = await finishedHafiz();
    const examiner = await createUser(prisma, { roles: [Role.RECITER] });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });

    // جاهزٌ للسرد الختاميّ.
    expect((await getWardView(student.id, prisma, NOW)).finishedLadder).toBe(true);

    // السرد الختاميّ (اجتياز) ⟵ لا شهادة بعد، والطور تثبيتٌ بعد.
    await recordTathbitFinal({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW);
    expect(await prisma.certificate.count({ where: { studentId: student.id, template: "MUDDAKIR_TATHBIT" } })).toBe(0);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).phase).toBe("TATHBIT");

    // الاعتماد ⟵ شهادة التثبيت + الورد الدائم.
    const r = await approveTathbit({ actorUserId: manager.id, studentId: student.id }, prisma);
    expect(r.alreadyApproved).toBe(false);
    const cert = await prisma.certificate.findFirstOrThrow({ where: { studentId: student.id, template: "MUDDAKIR_TATHBIT" } });
    expect(cert.id).toBe(r.certificateId);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).phase).toBe("PERMANENT");

    // الاعتماد idempotent.
    const r2 = await approveTathbit({ actorUserId: manager.id, studentId: student.id }, prisma);
    expect(r2.alreadyApproved).toBe(true);
    expect(await prisma.certificate.count({ where: { studentId: student.id, template: "MUDDAKIR_TATHBIT" } })).toBe(1);
  });

  it("الاعتماد يُرفض قبل اجتياز السرد الختاميّ", async () => {
    const student = await finishedHafiz();
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await expect(approveTathbit({ actorUserId: manager.id, studentId: student.id }, prisma)).rejects.toThrow();
  });

  it("الورد الدائم: بعد الاعتماد، ورد يوميٌّ بمقدار permanentWardJuz والعدّاد يستمرّ", async () => {
    const student = await finishedHafiz({ permanentWardJuz: 10 });
    const examiner = await createUser(prisma, { roles: [Role.RECITER] });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await recordTathbitFinal({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW);
    await approveTathbit({ actorUserId: manager.id, studentId: student.id }, prisma);
    // الورد الدائم يبدأ اليوم التالي للسرد الختاميّ ⟵ ورد اليوم = أوّل ١٠ أجزاء.
    const NEXT = new Date("2026-06-03T09:00:00.000Z");
    const v = await getWardView(student.id, prisma, NEXT);
    expect(v).toMatchObject({ phase: "PERMANENT", active: true, dailyJuz: 10 });
    expect(v.wards[0]).toMatchObject({ fromJuz: 1, toJuz: 10 });
    expect(v.cumulativeKhatmat).toBe(1); // ختمةُ التثبيت الوحيدة (مجموع ختمات السلّم) أساسٌ للدائم
  });
});
