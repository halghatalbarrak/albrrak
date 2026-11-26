import { AttendanceStatus, AutoEventType, PointGrantSource, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPointItem, getBalance } from "../economy";
import { markStudentAttendance } from "../attendance";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// يتحقّق من أنّ تسجيل الحضور يستدعي grantAuto لبند ATTENDANCE_PRESENT،
// وأنّ تغيير الحضور إلى غياب يعكس القيد تعويضيًّا (لا حذف).

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { circle, teacher, student, manager };
}

const DATE = "2026-11-26";

describe("ATTENDANCE_PRESENT يمنح نقطتين، وتغييره إلى غائب يعكس القيد", () => {
  it("حاضر ← +٢", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await createPointItem(manager.id, { nameAr: "حضور", value: 2, grantSource: PointGrantSource.AUTO, eventType: AutoEventType.ATTENDANCE_PRESENT });

    await markStudentAttendance(
      { circleId: circle.id, studentId: student.id, status: AttendanceStatus.PRESENT, date: DATE, recorderId: teacher.id },
      prisma,
    );

    expect(await getBalance(student.id, prisma)).toBe(2);
  });

  it("حاضر → غائب = ٠ (قيدٌ عكسيّ لا حذف)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await createPointItem(manager.id, { nameAr: "حضور", value: 2, grantSource: PointGrantSource.AUTO, eventType: AutoEventType.ATTENDANCE_PRESENT });

    const mark = (status: AttendanceStatus) =>
      markStudentAttendance({ circleId: circle.id, studentId: student.id, status, date: DATE, recorderId: teacher.id }, prisma);

    await mark(AttendanceStatus.PRESENT);         // +2
    await mark(AttendanceStatus.ABSENT_UNEXCUSED); // يعكس +2 بقيد −2

    expect(await getBalance(student.id, prisma)).toBe(0);

    const txns = await prisma.pointTransaction.findMany({ where: { studentId: student.id } });
    expect(txns).toHaveLength(2); // +2 ثمّ −2
    expect(txns.map((t) => t.amount).sort((a, b) => a - b)).toEqual([-2, 2]);

    // لا حذف: autoGrant الأوّل مُعكَس، لا مُحذَف
    const grants = await prisma.autoGrant.findMany({ where: { studentId: student.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0].reversedAt).not.toBeNull();
  });
});
