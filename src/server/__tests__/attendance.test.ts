import {
  ApprovalStatus,
  AttendanceStatus,
  ProgressState,
  ProgramKey,
  Role,
  StageKind,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  computeMedian,
  decideExcuse,
  getChapterMeasurement,
  getStudentChapterMeasurement,
  recordSession,
  requestAbsenceExcuse,
  requestPreExcuse,
} from "../attendance";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة: برنامج + باب (مرحلة) + حلقة + معلمها + طالبٌ منتسبٌ له تقدّمٌ جارٍ في الباب.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const stage = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "الباب الأول" },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.stageProgress.create({
    data: {
      studentId: student.id,
      stageId: stage.id,
      state: ProgressState.IN_PROGRESS,
      startedAt: new Date(),
      attendanceDays: 0,
    },
  });
  return { program, stage, circle, teacher, student };
}

const DATE = "2026-05-10";
const days = (studentId: string, stageId: string) =>
  prisma.stageProgress
    .findUniqueOrThrow({ where: { studentId_stageId: { studentId, stageId } } })
    .then((p) => p.attendanceDays);

describe("رصد الحضور (§١٠٫١) — الاستثناء لا القاعدة", () => {
  it("الجميع حاضرون افتراضًا، والغائب يُؤشَّر", async () => {
    const { circle, teacher, student } = await scaffold();
    const res = await recordSession(
      { circleId: circle.id, date: DATE, exceptions: [], recorderId: teacher.id },
      prisma,
    );
    expect(res).toEqual({ total: 1, present: 1, absent: 0 });
    const row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.PRESENT);
  });

  it("المعلم يرصد حلقاته فقط — غيره يُرفض في الخادم (§٣٫٢)", async () => {
    const { circle } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      recordSession(
        { circleId: circle.id, date: DATE, exceptions: [], recorderId: stranger.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("رصد طالبٍ ليس من الحلقة ← يُرفض", async () => {
    const { circle, teacher } = await scaffold();
    await expect(
      recordSession(
        {
          circleId: circle.id,
          date: DATE,
          exceptions: [{ studentId: "غريب", status: AttendanceStatus.ABSENT_UNEXCUSED }],
          recorderId: teacher.id,
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("القياس بأيام الحضور (§١١٫٤) — idempotent، ويحتسب الحضور الفعلي", () => {
  it("حاضر يزيد يومًا، وإعادة المزامنة لا تضاعف", async () => {
    const { circle, teacher, student, stage } = await scaffold();
    const rec = () =>
      recordSession(
        { circleId: circle.id, date: DATE, exceptions: [], recorderId: teacher.id },
        prisma,
      );
    await rec();
    expect(await days(student.id, stage.id)).toBe(1);
    await rec(); // إعادة إرسال (مزامنة) — لا عدٌّ مضاعف
    expect(await days(student.id, stage.id)).toBe(1);
  });

  it("متأخر وخرج مبكرًا يُحتسبان يوم حضور؛ الغياب لا", async () => {
    const { circle, teacher, student, stage } = await scaffold();
    const mark = (status: AttendanceStatus) =>
      recordSession(
        { circleId: circle.id, date: DATE, exceptions: [{ studentId: student.id, status }], recorderId: teacher.id },
        prisma,
      );

    await mark(AttendanceStatus.ABSENT_UNEXCUSED);
    expect(await days(student.id, stage.id)).toBe(0);
    await mark(AttendanceStatus.LATE);
    expect(await days(student.id, stage.id)).toBe(1); // متأخر يُحتسب
    await mark(AttendanceStatus.ABSENT_UNEXCUSED);
    expect(await days(student.id, stage.id)).toBe(0);
    await mark(AttendanceStatus.LEFT_EARLY);
    expect(await days(student.id, stage.id)).toBe(1); // خرج مبكرًا يُحتسب
  });
});

describe("العذر إجراءٌ بدورة حياة (§١٠٫٢) — القاعدة المطلقة", () => {
  it("قبول العذر بلا تفويض ABSENCE_EXCUSE ← يُرفض في الخادم، ويبقى معلّقًا", async () => {
    const { student } = await scaffold();
    const approval = await requestAbsenceExcuse(
      { studentId: student.id, date: DATE, reason: "مرض", requestedBy: student.userId },
      prisma,
    );
    const plainTeacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      decideExcuse({ approvalId: approval.id, decidedBy: plainTeacher.id, decision: "APPROVED" }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const after = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(after.status).toBe(ApprovalStatus.PENDING);
  });

  it("القبول يُسجَّل بصاحبه على سجل الحضور (excuseAcceptedBy)", async () => {
    const { student } = await scaffold();
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const approval = await requestAbsenceExcuse(
      { studentId: student.id, date: DATE, reason: "سفر", requestedBy: student.userId },
      prisma,
    );
    await decideExcuse(
      { approvalId: approval.id, decidedBy: manager.id, decision: "APPROVED" },
      prisma,
    );
    const row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.ABSENT_EXCUSED);
    expect(row.excuseAcceptedBy).toBe(manager.id);
    expect(row.excuseAcceptedAt).not.toBeNull();
  });

  it("تفويضٌ لدور المعلم يُمكّنه من القبول (§٣٫٣ — بلا نشر)", async () => {
    const { student } = await scaffold();
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const granter = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await prisma.permissionDelegation.create({
      data: { capability: "ABSENCE_EXCUSE", holderRole: Role.TEACHER, grantedBy: granter.id },
    });
    const approval = await requestAbsenceExcuse(
      { studentId: student.id, date: DATE, reason: "ظرف", requestedBy: student.userId },
      prisma,
    );
    const decided = await decideExcuse(
      { approvalId: approval.id, decidedBy: teacher.id, decision: "APPROVED" },
      prisma,
    );
    expect(decided.status).toBe(ApprovalStatus.APPROVED);
  });

  it("الرفض بلا سببٍ يُرفض (§٣٫٤)", async () => {
    const { student } = await scaffold();
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const approval = await requestAbsenceExcuse(
      { studentId: student.id, date: DATE, reason: "س", requestedBy: student.userId },
      prisma,
    );
    await expect(
      decideExcuse({ approvalId: approval.id, decidedBy: manager.id, decision: "REJECTED" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("الاستئذان يقدّمه الطالب/الولي فقط — غيرهما يُرفض", async () => {
    const { student } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.STUDENT] });
    await expect(
      requestAbsenceExcuse(
        { studentId: student.id, date: DATE, reason: "x", requestedBy: stranger.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("مستأذن مسبقًا (§١٠٫٢) — يتحوّل حالةً عند رصد اليوم", () => {
  it("طلبٌ معتمَدٌ ⟵ يُصبح PRE_EXCUSED عند الرصد ولا يُحتسب يوم حضور", async () => {
    const { circle, teacher, student, stage } = await scaffold();
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const today = new Date().toISOString().slice(0, 10);
    const approval = await requestPreExcuse(
      { studentId: student.id, date: today, reason: "موعد", requestedBy: student.userId },
      prisma,
    );
    await decideExcuse(
      { approvalId: approval.id, decidedBy: manager.id, decision: "APPROVED" },
      prisma,
    );
    const res = await recordSession(
      { circleId: circle.id, date: today, exceptions: [], recorderId: teacher.id },
      prisma,
    );
    expect(res.absent).toBe(1); // ليس حاضرًا
    const row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.PRE_EXCUSED);
    expect(await days(student.id, stage.id)).toBe(0); // لا يُحتسب
  });
});

describe("منهجية القياس (§١١) — وسيطٌ بلا حكم، ولا عتبات قبل ٢٠", () => {
  it("الوسيط لا المتوسط (§١١٫٣)", () => {
    expect(computeMedian([])).toBeNull();
    expect(computeMedian([5])).toBe(5);
    expect(computeMedian([9, 1, 5])).toBe(5);
    expect(computeMedian([2, 4, 6, 8])).toBe(5);
    // غائبٌ طويلًا يُفسد المتوسط ولا يحرّك الوسيط:
    expect(computeMedian([8, 9, 10, 200])).toBe(9.5);
  });

  it("التنبيه معطَّلٌ حتى ٢٠ إتمامًا (§١١٫١)", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const stage = await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "باب" },
    });
    // ثلاثة طلابٍ أتمّوا الباب بأيام حضورٍ مختلفة (أقلّ من ٢٠ إتمامًا).
    const values = [6, 10, 30];
    for (const v of values) {
      const { student } = await createStudent(prisma);
      await prisma.stageProgress.create({
        data: {
          studentId: student.id,
          stageId: stage.id,
          state: ProgressState.COMPLETED,
          startedAt: new Date(),
          completedAt: new Date(),
          attendanceDays: v,
        },
      });
    }
    const m = await getChapterMeasurement(stage.id, prisma);
    expect(m.peerMedian).toBe(10);
    expect(m.completedCount).toBe(3);
    expect(m.alertsEnabled).toBe(false); // < ٢٠ ⟵ لا تنبيه
    expect(m.students.every((s) => s.slow === false)).toBe(true);
  });

  it("سطر المدير: أيام الطالب ووسيط أقرانه (§١١٫٣)", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const stage = await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "باب" },
    });
    const mk = async (attendanceDays: number) => {
      const { student } = await createStudent(prisma);
      await prisma.stageProgress.create({
        data: { studentId: student.id, stageId: stage.id, state: ProgressState.IN_PROGRESS, startedAt: new Date(), attendanceDays },
      });
      return student.id;
    };
    const target = await mk(18);
    await mk(7);
    await mk(11);
    const view = await getStudentChapterMeasurement(target, stage.id, prisma);
    expect(view?.attendanceDays).toBe(18);
    expect(view?.peerMedian).toBe(9); // وسيط الأقران (7، 11) = 9 — عدا الطالب
  });
});
