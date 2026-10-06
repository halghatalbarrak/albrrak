import { AutoEventType, MuddakirMode, PointGrantSource, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { enrollInMuddakir, assignSupervisor } from "../muddakir-enrollment";
import {
  getStageProgress,
  listRecitationCandidates,
  recordStageRecitation,
  setStageMode,
} from "../muddakir-stages";
import { confirmWeekRegularity, meetingWeek } from "../muddakir-supervisor";
import { getBalance } from "../economy";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser, seedHizbBoundaries, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-05-13T09:00:00.000Z"); // أربعاء — ضمن نافذة أسبوع اللقاء
const { weekStart } = meetingWeek(NOW, "WEDNESDAY");
const dval = (d: string) => new Date(`${d}T00:00:00.000Z`);

async function scaffold(settings: Record<string, unknown> = {}) {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const def: Record<string, unknown> = {
    stageJuzCount: 5, tracks: [1, 2, 3], newReps: 5, firstCleanReps: 3, yesterdayReps: 10,
    ribatWindowDays: { "1": 20, "2": 15, "3": 10 }, reviewCycleDays: 7, treatmentLineReps: 3,
    treatmentCleanSessions: 3, weakFaceThreshold: null, meetingDay: "WEDNESDAY",
    maxHafizPerSupervisor: 4, monthlyExcuseLimit: null, ...settings,
  };
  await prisma.setting.createMany({ data: Object.entries(def).map(([key, value]) => ({ programId: mud.id, key, value: value as never })) });
  await seedMushafFaces(prisma);
  await seedHizbBoundaries(prisma);
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  const supUser = await createUser(prisma, { roles: [Role.ARIF] });
  await assignSupervisor({ studentId: student.id, supervisorId: supUser.id, actorId: supUser.id }, prisma);
  const examiner = await createUser(prisma, { roles: [Role.RECITER] });
  return { mud, student, user, supUser, examiner, circle };
}

/** يحفظ (IN_RIBAT) كل أوجه النطاق — يجعل المرحلة جاهزةً للسرد. */
async function memorize(studentId: string, from: number, to: number) {
  const data = Array.from({ length: to - from + 1 }, (_, i) => ({ studentId, page: from + i, state: "IN_RIBAT" as const, firstMemorizedOn: dval(weekStart) }));
  await prisma.muddakirFace.createMany({ data });
}

async function autoItem(eventType: AutoEventType, value: number) {
  const item = await prisma.pointItem.create({ data: { nameAr: `بند-${eventType}`, value, grantSource: PointGrantSource.AUTO } });
  await prisma.autoGrantRule.create({ data: { pointItemId: item.id, eventType, active: true } });
  return item;
}

describe("اكتمال المرحلة والجاهزيّة (§١/§٧)", () => {
  it("غير جاهزٍ قبل حفظ كل الأوجه، وجاهزٌ بعده (حدود deriveStages بالصفحات)", async () => {
    const { student } = await scaffold();
    const before = await getStageProgress(student.id, prisma);
    expect(before.stage).toBe(1);
    expect(before.startPage).toBe(1);
    expect(before.ready).toBe(false);
    await memorize(student.id, before.startPage, before.endPage);
    const after = await getStageProgress(student.id, prisma);
    expect(after.memorized).toBe(after.total);
    expect(after.ready).toBe(true);
  });
});

describe("تسجيل السرد (المختبِر) (§٧)", () => {
  it("الاجتياز: شهادة مرحلة (MUDDAKIR_STAGE) وانتقال currentStageId للتالية", async () => {
    const { student, examiner } = await scaffold();
    const p = await getStageProgress(student.id, prisma);
    await memorize(student.id, p.startPage, p.endPage);
    const r = await recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW);
    expect(r).toMatchObject({ passed: true, kind: "STAGE", stage: 1, nextStage: 2 });
    expect(r.certificateId).toBeTruthy();
    const cert = await prisma.certificate.findUniqueOrThrow({ where: { id: r.certificateId! } });
    expect(cert.template).toBe("MUDDAKIR_STAGE");
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).currentStageId).toBe("2");
  });

  it("عدم الاجتياز: مواضع الأخطاء تدخل علاج الأخطاء بمصدر EXAMINER، ويبقى في المرحلة", async () => {
    const { student, examiner } = await scaffold();
    const p = await getStageProgress(student.id, prisma);
    await memorize(student.id, p.startPage, p.endPage);
    await prisma.mushafLine.createMany({ data: [
      { page: 5, lineNo: 3, startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 2 },
      { page: 7, lineNo: 1, startSurah: 2, startAyah: 3, endSurah: 2, endAyah: 4 },
    ] });
    const r = await recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: false, errors: [{ page: 5, lineNo: 3 }, { page: 7, lineNo: 1 }] }, prisma, NOW);
    expect(r.passed).toBe(false);
    expect(r.certificateId).toBeNull();
    const errs = await prisma.muddakirError.findMany({ where: { studentId: student.id, resolvedAt: null } });
    expect(errs).toHaveLength(2);
    expect(errs.every((e) => e.source === "EXAMINER")).toBe(true);
    // يبقى في المرحلة الأولى (لا انتقال).
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).currentStageId).toBe("1");
  });

  it("لا يصحّ تسجيل الاجتياز قبل حفظ كل الأوجه", async () => {
    const { student, examiner } = await scaffold();
    await expect(recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW)).rejects.toThrow();
  });

  it("موضعٌ خارج المصحف يُرفض", async () => {
    const { student, examiner } = await scaffold();
    const p = await getStageProgress(student.id, prisma);
    await memorize(student.id, p.startPage, p.endPage);
    await expect(recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: false, errors: [{ page: 999, lineNo: 9 }] }, prisma, NOW)).rejects.toThrow();
  });
});

describe("أهليّة المختبِر (الحكم ٨، إعادة استعمال examiner-eligibility)", () => {
  it("غير المختبِر (معلّمٌ فقط) يُرفض؛ ومختبِرٌ هو معلّم الحافظ يُرفض", async () => {
    const { student, circle } = await scaffold();
    const p = await getStageProgress(student.id, prisma);
    await memorize(student.id, p.startPage, p.endPage);
    // دورٌ ليس RECITER ⟵ يُرفض.
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(recordStageRecitation({ examinerUserId: teacher.id, studentId: student.id, passed: true }, prisma, NOW)).rejects.toThrow();
    // مختبِرٌ (RECITER) لكنّه معلّم حلقة الحافظ ⟵ يُرفض (م١/الحكم ٨).
    const examinerTeacher = await createUser(prisma, { roles: [Role.RECITER] });
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: examinerTeacher.id } });
    await expect(recordStageRecitation({ examinerUserId: examinerTeacher.id, studentId: student.id, passed: true }, prisma, NOW)).rejects.toThrow();
  });
});

describe("نقاط ختام المرحلة في دفعة الأسبوع (§٧)", () => {
  it("لا منح فوريّ عند السرد؛ وتُصدَر MUDDAKIR_STAGE_COMPLETE عند تأكيد الأسبوع (مرّةً لا تتكرّر)", async () => {
    const { student, examiner, supUser } = await scaffold();
    await autoItem(AutoEventType.MUDDAKIR_STAGE_COMPLETE, 20);
    const p = await getStageProgress(student.id, prisma);
    await memorize(student.id, p.startPage, p.endPage);
    await recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW);
    expect(await getBalance(student.id, prisma)).toBe(0); // لا منح فوريّ

    const r = await confirmWeekRegularity({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    expect(r.stageCompletions).toBe(1);
    expect(await getBalance(student.id, prisma)).toBe(20);
    // التأكيد ثانيةً لا يكرّر.
    await confirmWeekRegularity({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    expect(await getBalance(student.id, prisma)).toBe(20);
  });
});

describe("الوقوف عند مرحلة (REVIEW_ONLY) (§١)", () => {
  it("المشرف يحوّل الوضع ويعيده، والغريب يُرفض", async () => {
    const { student, supUser } = await scaffold();
    expect((await setStageMode({ actorUserId: supUser.id, studentId: student.id, mode: MuddakirMode.REVIEW_ONLY }, prisma)).mode).toBe("REVIEW_ONLY");
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).mode).toBe("REVIEW_ONLY");
    await setStageMode({ actorUserId: supUser.id, studentId: student.id, mode: MuddakirMode.ACTIVE }, prisma);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).mode).toBe("ACTIVE");
    const stranger = await createUser(prisma, { roles: [Role.ARIF] });
    await expect(setStageMode({ actorUserId: stranger.id, studentId: student.id, mode: MuddakirMode.REVIEW_ONLY }, prisma)).rejects.toThrow();
  });
});

describe("التخرّج: السرد الختاميّ بعد المرحلة السادسة (§١)", () => {
  it("اجتياز السادسة ⟵ جاهزٌ للختاميّ، والختاميّ ⟵ شهادة البرنامج (MUDDAKIR_KHATM) ومتخرّج", async () => {
    const { student, examiner } = await scaffold();
    // انتقلْ إلى المرحلة السادسة مباشرةً (اختبارٌ أخفّ من حفظ ٦٠٤ وجهًا).
    await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { currentStageId: "6" } });
    const p6 = await getStageProgress(student.id, prisma);
    expect(p6.stage).toBe(6);
    await memorize(student.id, p6.startPage, p6.endPage);
    // سرد المرحلة السادسة ⟵ اجتياز.
    const r6 = await recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW);
    expect(r6).toMatchObject({ kind: "STAGE", stage: 6, nextStage: null });
    const afterSix = await getStageProgress(student.id, prisma);
    expect(afterSix.awaitingFinal).toBe(true);
    // السرد الختاميّ ⟵ شهادة البرنامج + متخرّج.
    const rf = await recordStageRecitation({ examinerUserId: examiner.id, studentId: student.id, passed: true }, prisma, NOW);
    expect(rf.kind).toBe("FINAL");
    expect(rf.graduated).toBe(true);
    const cert = await prisma.certificate.findUniqueOrThrow({ where: { id: rf.certificateId! } });
    expect(cert.template).toBe("MUDDAKIR_KHATM");
    expect((await getStageProgress(student.id, prisma)).graduated).toBe(true);
  });
});

describe("قائمة مرشّحي السرد (شاشة المختبِر)", () => {
  it("تُظهر الجاهزين فقط، للمختبِر المؤهّل", async () => {
    const { student, examiner } = await scaffold();
    expect(await listRecitationCandidates(examiner.id, prisma)).toEqual([]); // لا جاهز بعد
    const p = await getStageProgress(student.id, prisma);
    await memorize(student.id, p.startPage, p.endPage);
    const cands = await listRecitationCandidates(examiner.id, prisma);
    expect(cands.map((c) => c.studentId)).toEqual([student.id]);
    expect(cands[0]).toMatchObject({ stage: 1, kind: "STAGE" });
  });
});
