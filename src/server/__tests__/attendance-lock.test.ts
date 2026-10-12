import { AttendanceStatus, ProgramKey, Role, StageKind, ProgressState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordSession, requestAbsenceExcuse, requestPreExcuse, decideExcuse } from "../attendance";
import {
  approveAttendanceDay,
  getAttendanceDayLock,
  requestAttendanceUnlock,
  decideAttendanceUnlock,
  unlockAttendanceDay,
  getLockGraceDays,
  setLockGraceDays,
} from "../attendance-lock";
import { AuthorizationError, ValidationError } from "../errors";
import { makkahDayDate } from "@/lib/makkah-day";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

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
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.stageProgress.create({
    data: { studentId: student.id, stageId: stage.id, state: ProgressState.IN_PROGRESS, startedAt: new Date(), attendanceDays: 0 },
  });
  return { program, stage, circle, teacher, manager, student };
}

const D = "2026-05-10";
// لحظاتٌ بتوقيت UTC محورها يوم مكّة D (= 2026-05-10، مكّة = UTC+3):
const DURING_D = new Date("2026-05-10T10:00:00Z"); // ظهر D بمكّة
const D1_2059 = new Date("2026-05-11T20:59:00Z"); // 23:59 بمكّة من D+1 — ما زال ضمن المهلة
const D1_2100 = new Date("2026-05-11T21:00:00Z"); // 00:00 بمكّة من D+2 — انقضت المهلة (grace=1)
const FAR = new Date("2026-05-20T10:00:00Z"); // بعيدٌ — يومٌ مكّيٌّ آخر قطعاً

const att = (circleId: string, studentId: string) =>
  prisma.attendance.count({ where: { circleId, studentId } });

describe("اعتماد المعلّم يقفل اليوم فوراً", () => {
  it("بعد الاعتماد يُرفض الرصد في الخادم، والحالة APPROVED", async () => {
    const { circle, teacher, student } = await scaffold();
    // قبل الاعتماد: الرصد ممكن.
    await recordSession({ circleId: circle.id, date: D, exceptions: [{ studentId: student.id, status: AttendanceStatus.LATE }], recorderId: teacher.id, now: DURING_D }, prisma);

    await approveAttendanceDay(circle.id, D, teacher.id, prisma, DURING_D);
    const lock = await getAttendanceDayLock(circle.id, D, prisma, DURING_D);
    expect(lock.state).toBe("APPROVED");
    expect(lock.locked).toBe(true);

    await expect(
      recordSession({ circleId: circle.id, date: D, exceptions: [{ studentId: student.id, status: AttendanceStatus.ABSENT_UNEXCUSED }], recorderId: teacher.id, now: DURING_D }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("القفل التلقائيّ محسوبٌ بتوقيت مكّة (grace=1)", () => {
  it("مفتوحٌ يومه واليوم التالي حتى 20:59 UTC، ويُقفل عند 21:00 UTC", async () => {
    const { circle } = await scaffold();
    expect((await getAttendanceDayLock(circle.id, D, prisma, DURING_D)).state).toBe("OPEN");
    expect((await getAttendanceDayLock(circle.id, D, prisma, D1_2059)).state).toBe("OPEN");
    const locked = await getAttendanceDayLock(circle.id, D, prisma, D1_2100);
    expect(locked.state).toBe("AUTO_LOCKED");
    expect(locked.locked).toBe(true);
  });

  it("مزامنةٌ متأخرة ليومٍ مقفلٍ تلقائيّاً تُرفض ولا تُكتب", async () => {
    const { circle, teacher, student } = await scaffold();
    await expect(
      recordSession({ circleId: circle.id, date: D, exceptions: [{ studentId: student.id, status: AttendanceStatus.PRESENT }], recorderId: teacher.id, now: D1_2100 }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await att(circle.id, student.id)).toBe(0); // لم يُكتب شيء
  });
});

describe("القفل لا يمنع مسار العذر", () => {
  it("قبول العذر وتحوّل الاستئذان المسبق يعملان على يومٍ مقفل (معتمَد)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    // الاستئذان المسبق لا يُقبل لتاريخٍ مضى، فنستعمل يوم مكّة الحاليّ ونقفله بالاعتماد.
    const today = makkahDayDate(new Date());
    await approveAttendanceDay(circle.id, today, teacher.id, prisma); // قفلٌ فوريّ

    const ex = await requestAbsenceExcuse({ studentId: student.id, date: today, reason: "مرض", requestedBy: student.userId }, prisma);
    await decideExcuse({ approvalId: ex.id, decidedBy: manager.id, decision: "APPROVED" }, prisma);
    let row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.ABSENT_EXCUSED);

    const pre = await requestPreExcuse({ studentId: student.id, date: today, reason: "موعد", requestedBy: student.userId }, prisma);
    await decideExcuse({ approvalId: pre.id, decidedBy: manager.id, decision: "APPROVED" }, prisma);
    row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.PRE_EXCUSED); // تحوّل على يومٍ مقفل
  });
});

describe("فتح القفل", () => {
  it("طلبٌ يُعتمد ⟵ يُفتح مؤقّتاً ويُسجَّل، ويعود القفل في يومٍ مكّيٍّ تالٍ", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await approveAttendanceDay(circle.id, D, teacher.id, prisma, DURING_D);

    const appr = await requestAttendanceUnlock({ circleId: circle.id, date: D, reason: "خطأ إدخال", requestedBy: teacher.id }, prisma);
    await decideAttendanceUnlock({ approvalId: appr.id, decidedBy: manager.id, decision: "APPROVED" }, prisma);

    // مفتوحٌ مؤقّتاً اليوم (يوم الفتح) — الرصد ممكن.
    const nowOpen = await getAttendanceDayLock(circle.id, D, prisma);
    expect(nowOpen.state).toBe("TEMP_OPEN");
    expect(nowOpen.locked).toBe(false);
    await recordSession({ circleId: circle.id, date: D, exceptions: [{ studentId: student.id, status: AttendanceStatus.PRESENT }], recorderId: teacher.id }, prisma);

    // في يومٍ مكّيٍّ تالٍ للفتح ⟵ يعود القفل (APPROVED).
    const later = await getAttendanceDayLock(circle.id, D, prisma, FAR);
    expect(later.locked).toBe(true);
    expect(later.state).toBe("APPROVED");
  });

  it("طلبٌ يُرفض ⟵ يبقى اليوم مقفلاً", async () => {
    const { circle, teacher, manager } = await scaffold();
    await approveAttendanceDay(circle.id, D, teacher.id, prisma, DURING_D);
    const appr = await requestAttendanceUnlock({ circleId: circle.id, date: D, reason: "مراجعة", requestedBy: teacher.id }, prisma);
    await decideAttendanceUnlock({ approvalId: appr.id, decidedBy: manager.id, decision: "REJECTED", note: "لا مسوّغ" }, prisma);
    const lock = await getAttendanceDayLock(circle.id, D, prisma, DURING_D);
    expect(lock.locked).toBe(true);
  });

  it("معلّمٌ بلا صلاحية ATTENDANCE_UNLOCK لا يفتح مباشرةً ولا يبتّ", async () => {
    const { circle, teacher, manager } = await scaffold();
    await approveAttendanceDay(circle.id, D, teacher.id, prisma, DURING_D);
    await expect(
      unlockAttendanceDay({ circleId: circle.id, date: D, reason: "x", actorId: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const appr = await requestAttendanceUnlock({ circleId: circle.id, date: D, reason: "y", requestedBy: teacher.id }, prisma);
    await expect(
      decideAttendanceUnlock({ approvalId: appr.id, decidedBy: teacher.id, decision: "APPROVED" }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
    // المدير يفتح مباشرةً.
    const lock = await unlockAttendanceDay({ circleId: circle.id, date: D, reason: "تصحيح", actorId: manager.id }, prisma);
    expect(lock.state).toBe("TEMP_OPEN");
  });
});

describe("مهلة القفل إعدادٌ لا رقمٌ ثابت", () => {
  it("تغيير lockGraceDays يغيّر موعد القفل", async () => {
    const { circle, manager } = await scaffold();
    expect(await getLockGraceDays(prisma)).toBe(1); // الافتراضيّة (بلا بذر في قاعدة الاختبار)
    // grace=1: عند 21:00 UTC من D+1 ⟵ مقفل.
    expect((await getAttendanceDayLock(circle.id, D, prisma, D1_2100)).locked).toBe(true);
    // رفعُها إلى ٢ ⟵ اللحظة نفسها تصير مفتوحة.
    await setLockGraceDays(2, manager.id, prisma);
    expect(await getLockGraceDays(prisma)).toBe(2);
    expect((await getAttendanceDayLock(circle.id, D, prisma, D1_2100)).state).toBe("OPEN");
  });

  it("غير المخوّل لا يضبط المهلة", async () => {
    const { teacher } = await scaffold();
    await expect(setLockGraceDays(3, teacher.id, prisma)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
