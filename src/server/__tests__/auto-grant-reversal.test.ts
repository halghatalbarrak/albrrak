import { AttendanceStatus, AutoEventType, PointGrantSource, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPointItem, getBalance } from "../economy";
import { markStudentAttendance } from "../attendance";
import { recordHifz } from "../daily-session";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// م ج (ق٥ + الإصلاح العامّ): تغيير الحالة المتنافية في اليوم نفسه يعكس أثر السابقة بقيدٍ
// تعويضيّ (لا حذف، لا تراكم). الرصيد = SUM(amount) يبقى صحيحًا، والمعكوس لا يمنع إعادة المنح.

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, circle, teacher, student, manager };
}

const bind = (managerId: string, eventType: AutoEventType, value: number) =>
  createPointItem(managerId, { nameAr: `تلقائيّ-${eventType}`, value, grantSource: PointGrantSource.AUTO, eventType });

const DATE = "2026-05-10";

/** مجموع الدفتر مباشرةً (لمطابقته بالرصيد المعروض getBalance). */
async function ledgerSum(studentId: string): Promise<number> {
  const agg = await prisma.pointTransaction.aggregate({ where: { studentId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

describe("عكس المنح المتنافي في اليوم (الحضور) — قيدٌ تعويضيّ لا حذف", () => {
  it("حاضر ← غائب = −10 فقط، والدفتر ثلاثة قيود (+5، −5، −10)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    await bind(manager.id, AutoEventType.ATTENDANCE_ABSENT, -10);
    const mark = (status: AttendanceStatus) =>
      markStudentAttendance({ circleId: circle.id, studentId: student.id, status, date: DATE, recorderId: teacher.id }, prisma);

    await mark(AttendanceStatus.PRESENT);
    await mark(AttendanceStatus.ABSENT_UNEXCUSED);

    expect(await getBalance(student.id, prisma)).toBe(-10);
    const txns = await prisma.pointTransaction.findMany({ where: { studentId: student.id } });
    expect(txns).toHaveLength(3);
    expect(txns.map((t) => t.amount).sort((a, b) => a - b)).toEqual([-10, -5, 5]);
  });

  it("حاضر ← غائب ← حاضر = +5 فقط، بلا حذفٍ لأيّ صفّ، والرصيد يطابق مجموع الدفتر", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    await bind(manager.id, AutoEventType.ATTENDANCE_ABSENT, -10);
    const mark = (status: AttendanceStatus) =>
      markStudentAttendance({ circleId: circle.id, studentId: student.id, status, date: DATE, recorderId: teacher.id }, prisma);

    await mark(AttendanceStatus.PRESENT);
    await mark(AttendanceStatus.ABSENT_UNEXCUSED);
    await mark(AttendanceStatus.PRESENT);

    expect(await getBalance(student.id, prisma)).toBe(5);
    expect(await getBalance(student.id, prisma)).toBe(await ledgerSum(student.id)); // المعروض = المجموع
    // لا حذف: منحان معكوسان (PRESENT الأوّل، ABSENT) + منحٌ نشطٌ واحد (PRESENT الثاني).
    const grants = await prisma.autoGrant.findMany({ where: { studentId: student.id } });
    expect(grants).toHaveLength(3);
    expect(grants.filter((g) => g.reversedAt !== null)).toHaveLength(2);
    expect(grants.filter((g) => g.reversedAt === null)).toHaveLength(1);
  });

  it("المعكوس لا يمنع إعادة المنح (حاضر بعد عكسه يُمنح ثانيةً)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    await bind(manager.id, AutoEventType.ATTENDANCE_ABSENT, -10);
    const mark = (status: AttendanceStatus) =>
      markStudentAttendance({ circleId: circle.id, studentId: student.id, status, date: DATE, recorderId: teacher.id }, prisma);
    await mark(AttendanceStatus.PRESENT);
    await mark(AttendanceStatus.ABSENT_UNEXCUSED);
    await mark(AttendanceStatus.PRESENT);
    // منحان نشطان بالحدث PRESENT ممنوعان؛ نتوقّع منحًا نشطًا واحدًا فقط (الأوّل عُكِس).
    const activePresent = await prisma.autoGrant.count({
      where: { studentId: student.id, eventType: AutoEventType.ATTENDANCE_PRESENT, reversedAt: null },
    });
    expect(activePresent).toBe(1);
  });

  it("نفس الحالة مرّتين = لا تكرار (حاضر ثمّ حاضر = +5 مرّةً)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    const mark = () =>
      markStudentAttendance({ circleId: circle.id, studentId: student.id, status: AttendanceStatus.PRESENT, date: DATE, recorderId: teacher.id }, prisma);
    await mark(); await mark();
    expect(await getBalance(student.id, prisma)).toBe(5);
    const grants = await prisma.autoGrant.findMany({ where: { studentId: student.id } });
    expect(grants).toHaveLength(1); // لا عكس ولا تكرار — الحالة نفسها
  });

  it("تحوّل الحضور إلى حالةٍ بلا حدث (مستأذن) يعكس السابق ولا يمنح جديدًا", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    const mark = (status: AttendanceStatus) =>
      markStudentAttendance({ circleId: circle.id, studentId: student.id, status, date: DATE, recorderId: teacher.id }, prisma);
    await mark(AttendanceStatus.PRESENT);
    await mark(AttendanceStatus.ABSENT_EXCUSED); // لا حدث لها
    expect(await getBalance(student.id, prisma)).toBe(0); // +5 عُكِس بـ−5
    const active = await prisma.autoGrant.count({ where: { studentId: student.id, reversedAt: null } });
    expect(active).toBe(0);
  });
});

describe("عكس المنح المتنافي في اليوم (مراقي: الحفظ) — كنمط الحضور", () => {
  it("أتقن ← لم يُتقن ← أتقن = كسب الحفظ فقط (لا تراكم)", async () => {
    const { teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.HIFZ_DONE, 4);
    await bind(manager.id, AutoEventType.HIFZ_MISSED, -8);
    const rec = (mastered: boolean) =>
      recordHifz({ studentId: student.id, date: DATE, fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6, attempts: mastered ? 1 : 3, mastered, teacherId: teacher.id }, prisma);
    await rec(true);   // +4
    await rec(false);  // عكس +4 (−4)، ثمّ −8
    await rec(true);   // عكس −8 (+8)، ثمّ +4
    expect(await getBalance(student.id, prisma)).toBe(4);
    expect(await getBalance(student.id, prisma)).toBe(await ledgerSum(student.id));
  });
});
