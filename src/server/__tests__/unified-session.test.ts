import { AttendanceStatus, AutoEventType, PointGrantSource, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getUnifiedBoard, recordExtra } from "../unified-session";
import { markStudentAttendance } from "../attendance";
import { createPointItem, getBalance } from "../economy";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

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

async function withTrack(programId: string, studentId: string) {
  const track = await prisma.track.create({ data: { programId, nameAr: "صفحة", linesPerDay: 15, ordinal: 4 } });
  await prisma.trackUnit.createMany({
    data: [
      { trackId: track.id, unitNo: 1, startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 },
      { trackId: track.id, unitNo: 2, startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6 },
    ],
  });
  await prisma.trackAssignment.create({ data: { studentId, trackId: track.id, reason: "PACE_TEST" } });
  return track;
}

const bind = (managerId: string, eventType: AutoEventType, value: number) =>
  createPointItem(managerId, { nameAr: `تلقائيّ-${eventType}`, value, grantSource: PointGrantSource.AUTO, eventType });

const DATE = "2026-05-10";

describe("markStudentAttendance — تأشير حضور طالبٍ واحد (م ج)", () => {
  it("يرفع حالة الطالب ويُطلق حدثها، ولا يمسّ غيره", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    const { student: other } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: other.id, circleId: circle.id } });
    await bind(manager.id, AutoEventType.ATTENDANCE_LATE, -1);

    await markStudentAttendance({ circleId: circle.id, studentId: student.id, status: AttendanceStatus.LATE, date: DATE, recorderId: teacher.id }, prisma);
    const row = await prisma.attendance.findUniqueOrThrow({ where: { studentId_date: { studentId: student.id, date: new Date(DATE) } } });
    expect(row.status).toBe(AttendanceStatus.LATE);
    expect(await getBalance(student.id, prisma)).toBe(-1);
    // الطالب الآخر لم يُرفَع ⟵ لا سجلّ له.
    const otherRow = await prisma.attendance.findUnique({ where: { studentId_date: { studentId: other.id, date: new Date(DATE) } } });
    expect(otherRow).toBeNull();
  });
});

describe("recordExtra — مكافأة الزيادة (م ج)", () => {
  it("يُطلق HIFZ_EXTRA بالوحدة التالية، ويمنع الازدواج لنفس الوحدة/اليوم", async () => {
    const { program, circle, teacher, student, manager } = await scaffold();
    await withTrack(program.id, student.id);
    await bind(manager.id, AutoEventType.HIFZ_EXTRA, 2);

    const r = await recordExtra({ studentId: student.id, actorId: teacher.id, kind: "hifz", date: DATE }, prisma);
    expect(r.unit).toMatchObject({ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 }); // الوحدة ١ (الفاتحة)
    expect(await getBalance(student.id, prisma)).toBe(2);
    await recordExtra({ studentId: student.id, actorId: teacher.id, kind: "hifz", date: DATE }, prisma); // نفس الوحدة/اليوم
    expect(await getBalance(student.id, prisma)).toBe(2); // لا تكرار
    void circle;
  });

  it("بلا مسارٍ مُسنَد ← لا وحدة، لا منح", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.HIFZ_EXTRA, 2);
    const r = await recordExtra({ studentId: student.id, actorId: teacher.id, kind: "hifz", date: DATE }, prisma);
    expect(r.unit).toBeNull();
    expect(await getBalance(student.id, prisma)).toBe(0);
    void circle;
  });
});

describe("getUnifiedBoard — اللوحة الموحّدة (م ج)", () => {
  it("تعرض حالة حضور كل طالب (null إن لم يُرفَع) ووجهة يومه", async () => {
    const { program, circle, teacher, student } = await scaffold();
    await withTrack(program.id, student.id);
    // قبل الرفع: null.
    let board = await getUnifiedBoard(teacher.id, circle.id, DATE, prisma);
    const before = board.students.find((s) => s.studentId === student.id);
    expect(before?.attendanceStatus).toBeNull();
    expect(before?.today.newHifz).toEqual({ kind: "NEW", bound: { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 } });
    // بعد الرفع: الحالة تظهر.
    await markStudentAttendance({ circleId: circle.id, studentId: student.id, status: AttendanceStatus.PRESENT, date: DATE, recorderId: teacher.id }, prisma);
    board = await getUnifiedBoard(teacher.id, circle.id, DATE, prisma);
    expect(board.students.find((s) => s.studentId === student.id)?.attendanceStatus).toBe(AttendanceStatus.PRESENT);
  });
});
