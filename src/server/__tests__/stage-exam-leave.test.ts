import { ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addCalendarDays,
  assertReadyForStageExam,
  computeEffectiveEndsOn,
  deferStageExam,
  isAdminRole,
  listOnLeaveForStaff,
  listReadyForStageExam,
  toUtcDateOnly,
} from "../stage-exam-leave";
import { recordHifz } from "../daily-session";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";
import { ApprovalKind, ApprovalStatus } from "@prisma/client";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══════════════ دوالُّ نقيّة ═══════════════

describe("حساب مهلة الإجازة (دوالٌّ نقيّة)", () => {
  it("addCalendarDays يضيف أيّامًا تقويميّة شاملةً العطلة", () => {
    // الخميس ١ يناير ٢٠٢٦ + ٧ = الخميس ٨ (لا تخطّي للجمعة/السبت).
    expect(toUtcDateOnly(addCalendarDays(new Date("2026-01-01"), 7)).toISOString().slice(0, 10)).toBe("2026-01-08");
  });
  it("computeEffectiveEndsOn: الأساس + تأجيل المعلّم (٧) + تأجيلات الإدارة (٧ لكلٍّ)", () => {
    const base = new Date("2026-03-08");
    expect(computeEffectiveEndsOn(base, false, 0).toISOString().slice(0, 10)).toBe("2026-03-08");
    expect(computeEffectiveEndsOn(base, true, 0).toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(computeEffectiveEndsOn(base, true, 2).toISOString().slice(0, 10)).toBe("2026-03-29");
  });
  it("isAdminRole يميّز أدوار الإدارة", () => {
    expect(isAdminRole([Role.TEACHER])).toBe(false);
    expect(isAdminRole([Role.RECITER])).toBe(false);
    expect(isAdminRole([Role.CIRCLE_MANAGER])).toBe(true);
    expect(isAdminRole([Role.SUPER_ADMIN])).toBe(true);
    expect(isAdminRole([Role.TECH_ADMIN])).toBe(true);
  });
});

// ═══════════════ البدء التلقائيّ (تكامل عبر recordHasad) ═══════════════

// حلقة مراقي بمعلّمها، وطالبٌ IN_MARAQI، ومرحلةٌ أصليّة بحدود سورٍ تنتهي بالنبأ (٧٨:٤٠).
// الاستحقاق ببلوغ الجبهة الحدّ (القرار أ)، لا باكتمال الأحزاب — فنُسجّل الحفظ بـrecordHifz.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية الأولى", fromSurah: 114, fromAyah: 1, toSurah: 78, toAyah: 40 },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  return { program, main, circle, teacher, student, reciter };
}

// يسجّل حفظ مقطعٍ (يحرّك الجبهة) — المقطع من سورةٍ واحدة لتبسيط الحدود.
const hifz = (studentId: string, teacherId: string, surah: number, fromAyah: number, toAyah: number) =>
  recordHifz({ studentId, teacherId, date: "2026-05-10", fromSurah: surah, fromAyah, toSurah: surah, toAyah, attempts: 1, mastered: true }, prisma);

describe("بدء إجازة اختبار المرحلة ببلوغ الجبهة حدَّ السورة (القرار أ)", () => {
  it("حفظٌ دون بلوغ حدّ المرحلة لا يبدأ الإجازة", async () => {
    const { main, teacher, student } = await scaffold();
    await hifz(student.id, teacher.id, 114, 1, 6); // الجبهة عند الناس — قبل حدّ النبأ
    const count = await prisma.stageExamLeave.count({ where: { studentId: student.id, mainStageId: main.id } });
    expect(count).toBe(0);
  });

  it("بلوغ الجبهة نهايةَ سورة الحدّ (النبأ ٧٨:٤٠) يبدأ إجازةً ٧ أيّام", async () => {
    const { main, teacher, student } = await scaffold();
    await hifz(student.id, teacher.id, 78, 1, 40); // الجبهة بلغت نهاية النبأ = حدّ المرحلة
    const leave = await prisma.stageExamLeave.findUniqueOrThrow({
      where: { studentId_mainStageId: { studentId: student.id, mainStageId: main.id } },
    });
    const days = (leave.baseEndsOn.getTime() - leave.startedOn.getTime()) / 86_400_000;
    expect(days).toBe(7);
    expect(leave.effectiveEndsOn.getTime()).toBe(leave.baseEndsOn.getTime());
    expect(await prisma.event.count({ where: { type: "STAGE_EXAM_LEAVE_STARTED", subjectId: student.id } })).toBe(1);
  });

  it("لا تُنشأ إجازةٌ ثانية لنفس المرحلة (idempotent)", async () => {
    const { main, teacher, student } = await scaffold();
    await hifz(student.id, teacher.id, 78, 1, 40);
    await hifz(student.id, teacher.id, 78, 1, 40); // إعادة تسجيلٍ لا تُنشئ إجازةً ثانية
    const count = await prisma.stageExamLeave.count({ where: { studentId: student.id, mainStageId: main.id } });
    expect(count).toBe(1);
  });
});

// ═══════════════ التأجيل (قواعد مطلقة) ═══════════════

async function seedLeave(studentId: string, mainStageId = "main-1") {
  return prisma.stageExamLeave.create({
    data: {
      studentId,
      mainStageId,
      startedOn: new Date("2026-03-01"),
      baseEndsOn: new Date("2026-03-08"),
      effectiveEndsOn: new Date("2026-03-08"),
    },
  });
}

describe("تأجيل اختبار المرحلة (البند ١)", () => {
  it("المعلّم يؤجّل مرّةً (+٧)، والثانية تُرفض", async () => {
    const { student } = await createStudent(prisma);
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await seedLeave(student.id);

    const first = await deferStageExam({ studentId: student.id, actorId: teacher.id, actorRoles: [Role.TEACHER] });
    expect(first.teacherDeferredOnce).toBe(true);
    expect(first.adminDeferrals).toBe(0);
    expect(first.effectiveEndsOn).toBe("2026-03-15");

    await expect(
      deferStageExam({ studentId: student.id, actorId: teacher.id, actorRoles: [Role.TEACHER] }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("الإدارة تؤجّل بلا حدّ (+٧ لكلٍّ)", async () => {
    const { student } = await createStudent(prisma);
    const admin = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await seedLeave(student.id);

    const r1 = await deferStageExam({ studentId: student.id, actorId: admin.id, actorRoles: [Role.CIRCLE_MANAGER] });
    expect(r1.effectiveEndsOn).toBe("2026-03-15");
    const r2 = await deferStageExam({ studentId: student.id, actorId: admin.id, actorRoles: [Role.CIRCLE_MANAGER] });
    expect(r2.effectiveEndsOn).toBe("2026-03-22");
    const r3 = await deferStageExam({ studentId: student.id, actorId: admin.id, actorRoles: [Role.SUPER_ADMIN] });
    expect(r3.adminDeferrals).toBe(3);
    expect(r3.effectiveEndsOn).toBe("2026-03-29");
  });

  it("لا إجازةَ قائمة ← يُرفض", async () => {
    const { student } = await createStudent(prisma);
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      deferStageExam({ studentId: student.id, actorId: teacher.id, actorRoles: [Role.TEACHER] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══════════════ الجاهزية + البوّابة المطلقة (المرحلة ٢) ═══════════════

// طالبٌ أتمّ مرحلةً أصليّة بحزبين (COMPLETED)، بإجازةٍ تنتهي في التاريخ المُعطى، ومُسمِّعٌ محايد.
async function readyScaffold(effectiveEndsOn: Date) {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية الأولى" },
  });
  const mk = (ordinal: number, hizb: number, fs: number, fa: number, ts: number, ta: number) =>
    prisma.stage.create({
      data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal, nameAr: `ح${hizb}`, parentId: main.id, hizbNumber: hizb, fromSurah: fs, fromAyah: fa, toSurah: ts, toAyah: ta },
    });
  const h60 = await mk(1, 60, 87, 1, 114, 6);
  const h59 = await mk(2, 59, 78, 1, 86, 17);
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  for (const s of [h60, h59]) {
    await prisma.stageProgress.create({
      data: { studentId: student.id, stageId: s.id, state: "COMPLETED", startedAt: new Date(), completedAt: new Date() },
    });
  }
  const leave = await prisma.stageExamLeave.create({
    data: { studentId: student.id, mainStageId: main.id, startedOn: new Date("2026-03-01"), baseEndsOn: effectiveEndsOn, effectiveEndsOn },
  });
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  return { program, main, circle, teacher, student, reciter, leave };
}

const PAST = new Date("2020-01-01");
const FUTURE = new Date("2999-01-01");

async function seedPendingTransition(studentId: string, examinerId: string) {
  await prisma.approval.create({
    data: {
      kind: ApprovalKind.STAGE_TRANSITION,
      status: ApprovalStatus.PENDING,
      subjectType: "StageExam",
      subjectId: "exam-x",
      proposedBy: examinerId,
      payload: { studentId },
    },
  });
}

describe("البوّابة المطلقة assertReadyForStageExam (البند ١)", () => {
  it("قبل انقضاء الإجازة ← يُرفض", async () => {
    const { student, main } = await readyScaffold(FUTURE);
    await expect(assertReadyForStageExam({ studentId: student.id, mainStageId: main.id })).rejects.toBeInstanceOf(ValidationError);
  });
  it("بعد انقضاء الإجازة ← يُقبل", async () => {
    const { student, main } = await readyScaffold(PAST);
    await expect(assertReadyForStageExam({ studentId: student.id, mainStageId: main.id })).resolves.toBeUndefined();
  });
  it("مع اقتراح انتقالٍ معلّق ← يُرفض", async () => {
    const { student, main, reciter } = await readyScaffold(PAST);
    await seedPendingTransition(student.id, reciter.id);
    await expect(assertReadyForStageExam({ studentId: student.id, mainStageId: main.id })).rejects.toBeInstanceOf(ValidationError);
  });
  it("بلا إجازةٍ أصلًا ← يُرفض", async () => {
    const { student } = await createStudent(prisma);
    await expect(assertReadyForStageExam({ studentId: student.id, mainStageId: "main-x" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("قائمة الجاهزين listReadyForStageExam (البند ١)", () => {
  it("إجازةٌ انقضت + مختبِرٌ محايد ← يظهر بكامل أحزابه", async () => {
    const { student, reciter } = await readyScaffold(PAST);
    const list = await listReadyForStageExam(reciter.id);
    const row = list.find((r) => r.studentId === student.id);
    expect(row).toBeDefined();
    expect(row!.hizbs).toHaveLength(2);
  });
  it("المختبِر معلّم الطالب ← يُستبعد (حياد)", async () => {
    const { student, teacher } = await readyScaffold(PAST);
    const list = await listReadyForStageExam(teacher.id);
    expect(list.find((r) => r.studentId === student.id)).toBeUndefined();
  });
  it("إجازةٌ لم تنقضِ ← يُستبعد", async () => {
    const { student, reciter } = await readyScaffold(FUTURE);
    const list = await listReadyForStageExam(reciter.id);
    expect(list.find((r) => r.studentId === student.id)).toBeUndefined();
  });
  it("مع اقتراحٍ معلّق ← يُستبعد", async () => {
    const { student, reciter } = await readyScaffold(PAST);
    await seedPendingTransition(student.id, reciter.id);
    const list = await listReadyForStageExam(reciter.id);
    expect(list.find((r) => r.studentId === student.id)).toBeUndefined();
  });
});

describe("في الإجازة listOnLeaveForStaff (البند ١)", () => {
  it("الإدارة ترى الطالب في إجازته مع إمكان التأجيل", async () => {
    const { student, main } = await readyScaffold(FUTURE);
    const admin = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const list = await listOnLeaveForStaff({ userId: admin.id, roles: [Role.CIRCLE_MANAGER] });
    const row = list.find((r) => r.studentId === student.id);
    expect(row).toBeDefined();
    expect(row!.mainStageId).toBe(main.id);
    expect(row!.canDefer).toBe(true);
  });
  it("المعلّم يرى طلاب حلقته فقط", async () => {
    const { student, teacher } = await readyScaffold(FUTURE);
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    expect((await listOnLeaveForStaff({ userId: teacher.id, roles: [Role.TEACHER] })).find((r) => r.studentId === student.id)).toBeDefined();
    expect((await listOnLeaveForStaff({ userId: stranger.id, roles: [Role.TEACHER] })).find((r) => r.studentId === student.id)).toBeUndefined();
  });
});
