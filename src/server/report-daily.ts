import { type PrismaClient, AttendanceStatus, MuddakirDayStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { makkahDayStart, makkahDayDate } from "@/lib/makkah-day";

// ─── أنواع مشتركة ───────────────────────────────────────────────────────────

export interface AttendanceSummary {
  total: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  leftEarly: number;
  notRecorded: number;
}

export interface StudentRow {
  studentId: string;
  name: string;
  attendanceStatus: AttendanceStatus | null;
  hasSession: boolean;
  hifzRange: string | null;
  hifzAttempts: number | null;
  tarseekhDone: boolean | null;
  murajaahDone: boolean | null;
}

function isPresent(s: AttendanceStatus): boolean {
  return s === AttendanceStatus.PRESENT || s === AttendanceStatus.LATE || s === AttendanceStatus.LEFT_EARLY;
}

function isAbsent(s: AttendanceStatus): boolean {
  return s === AttendanceStatus.ABSENT_UNEXCUSED || s === AttendanceStatus.ABSENT_EXCUSED;
}

function isExcused(s: AttendanceStatus): boolean {
  return s === AttendanceStatus.ABSENT_EXCUSED || s === AttendanceStatus.PRE_EXCUSED;
}

// ─── تقرير المعلّم ───────────────────────────────────────────────────────────

export interface TeacherDailyReport {
  kind: "teacher";
  date: string;
  circleName: string;
  circleId: string;
  attendance: AttendanceSummary;
  students: StudentRow[];
  notRecited: StudentRow[];
  repeated: StudentRow[];
}

export async function getTeacherReport(
  teacherUserId: string,
  date: string,
  db: PrismaClient = prisma,
): Promise<TeacherDailyReport[]> {
  const dayStart = makkahDayStart(new Date(`${date}T12:00:00+03:00`));

  const assignments = await db.circleTeacher.findMany({
    where: { teacherId: teacherUserId, endedAt: null },
    select: { circleId: true, circle: { select: { nameAr: true } } },
  });

  const reports: TeacherDailyReport[] = [];

  for (const { circleId, circle } of assignments) {
    const enrollments = await db.enrollment.findMany({
      where: { circleId, endedAt: null },
      select: { studentId: true, student: { select: { user: { select: { nameAsInId: true } } } } },
    });

    const studentIds = enrollments.map((e) => e.studentId);
    const nameMap = new Map(enrollments.map((e) => [e.studentId, e.student.user.nameAsInId]));

    const [attendances, sessions] = await Promise.all([
      db.attendance.findMany({
        where: { circleId, date: dayStart },
        select: { studentId: true, status: true },
      }),
      db.dailySession.findMany({
        where: { circleId, date: dayStart },
        select: { studentId: true, hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true, hifzAttempts: true, tarseekhDone: true, murajaahDone: true },
      }),
    ]);

    const attendMap = new Map(attendances.map((a) => [a.studentId, a.status]));
    const sessMap = new Map(sessions.map((s) => [s.studentId, s]));

    const summary: AttendanceSummary = { total: studentIds.length, present: 0, late: 0, excused: 0, absent: 0, leftEarly: 0, notRecorded: 0 };

    const rows: StudentRow[] = studentIds.map((sid) => {
      const status = attendMap.get(sid) ?? null;
      const sess = sessMap.get(sid) ?? null;
      if (!status) summary.notRecorded++;
      else {
        if (status === AttendanceStatus.PRESENT) summary.present++;
        else if (status === AttendanceStatus.LATE) summary.late++;
        else if (isExcused(status)) summary.excused++;
        else if (isAbsent(status)) summary.absent++;
        else if (status === AttendanceStatus.LEFT_EARLY) summary.leftEarly++;
      }
      const hifzRange =
        sess?.hifzFromSurah != null && sess.hifzToSurah != null
          ? `${sess.hifzFromSurah}:${sess.hifzFromAyah ?? 1} → ${sess.hifzToSurah}:${sess.hifzToAyah ?? 1}`
          : null;
      return {
        studentId: sid,
        name: nameMap.get(sid) ?? sid,
        attendanceStatus: status,
        hasSession: !!sess,
        hifzRange,
        hifzAttempts: sess?.hifzAttempts ?? null,
        tarseekhDone: sess?.tarseekhDone ?? null,
        murajaahDone: sess?.murajaahDone ?? null,
      };
    });

    const presentRows = rows.filter((r) => r.attendanceStatus !== null && isPresent(r.attendanceStatus));

    reports.push({
      kind: "teacher",
      date,
      circleName: circle.nameAr,
      circleId,
      attendance: summary,
      students: rows,
      notRecited: presentRows.filter((r) => !r.hasSession),
      repeated: rows.filter((r) => (r.hifzAttempts ?? 0) > 1),
    });
  }

  return reports;
}

// ─── تقرير المشرف ────────────────────────────────────────────────────────────

export interface CircleRow {
  circleId: string;
  circleName: string;
  total: number;
  present: number;
  absent: number;
  sessions: number;
}

export interface SupervisorDailyReport {
  kind: "supervisor";
  date: string;
  circles: CircleRow[];
  totals: AttendanceSummary;
  totalSessions: number;
}

export async function getSupervisorReport(
  date: string,
  db: PrismaClient = prisma,
): Promise<SupervisorDailyReport> {
  const dayStart = makkahDayStart(new Date(`${date}T12:00:00+03:00`));

  const circles = await db.circle.findMany({
    where: { deletedAt: null },
    select: { id: true, nameAr: true },
  });

  const totals: AttendanceSummary = { total: 0, present: 0, late: 0, excused: 0, absent: 0, leftEarly: 0, notRecorded: 0 };
  let totalSessions = 0;
  const circleRows: CircleRow[] = [];

  for (const circle of circles) {
    const [enrollCount, att, sesCount] = await Promise.all([
      db.enrollment.count({ where: { circleId: circle.id, endedAt: null } }),
      db.attendance.findMany({
        where: { circleId: circle.id, date: dayStart },
        select: { status: true },
      }),
      db.dailySession.count({ where: { circleId: circle.id, date: dayStart } }),
    ]);

    if (enrollCount === 0) continue;

    let present = 0, absent = 0;
    for (const a of att) {
      totals.total++;
      if (a.status === AttendanceStatus.PRESENT) { totals.present++; present++; }
      else if (a.status === AttendanceStatus.LATE) { totals.late++; present++; }
      else if (a.status === AttendanceStatus.LEFT_EARLY) { totals.leftEarly++; present++; }
      else if (isExcused(a.status)) totals.excused++;
      else if (isAbsent(a.status)) { totals.absent++; absent++; }
    }
    const notRec = enrollCount - att.length;
    totals.notRecorded += notRec;
    totals.total += notRec;

    totalSessions += sesCount;
    circleRows.push({ circleId: circle.id, circleName: circle.nameAr, total: enrollCount, present: present + notRec, absent, sessions: sesCount });
  }

  return { kind: "supervisor", date, circles: circleRows, totals, totalSessions };
}

// ─── تقرير الإدارة ───────────────────────────────────────────────────────────

export interface AdminDailyReport {
  kind: "admin";
  date: string;
  totalStudents: number;
  present: number;
  absent: number;
  sessions: number;
  attendanceRate: number;
}

export async function getAdminReport(
  date: string,
  db: PrismaClient = prisma,
): Promise<AdminDailyReport> {
  const dayStart = makkahDayStart(new Date(`${date}T12:00:00+03:00`));

  const [totalStudents, att, sessions] = await Promise.all([
    db.student.count({ where: { deletedAt: null, enrollments: { some: { endedAt: null } } } }),
    db.attendance.groupBy({ by: ["status"], where: { date: dayStart }, _count: true }),
    db.dailySession.count({ where: { date: dayStart } }),
  ]);

  const present = att
    .filter((a) => isPresent(a.status))
    .reduce((s, a) => s + a._count, 0);
  const absent = att
    .filter((a) => isAbsent(a.status))
    .reduce((s, a) => s + a._count, 0);
  const attendanceRate = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;

  return { kind: "admin", date, totalStudents, present, absent, sessions, attendanceRate };
}

// ─── تقرير الطالب ────────────────────────────────────────────────────────────

export interface StudentDailyReport {
  kind: "student";
  date: string;
  attendanceStatus: AttendanceStatus | null;
  hifzRange: string | null;
  hifzAttempts: number | null;
  tarseekhDone: boolean | null;
  murajaahDone: boolean | null;
  pointsToday: number;
}

export async function getStudentReport(
  studentUserId: string,
  date: string,
  db: PrismaClient = prisma,
): Promise<StudentDailyReport> {
  const dayStart = makkahDayStart(new Date(`${date}T12:00:00+03:00`));

  const student = await db.student.findFirst({
    where: { userId: studentUserId, deletedAt: null },
    select: { id: true },
  });

  if (!student) {
    return { kind: "student", date, attendanceStatus: null, hifzRange: null, hifzAttempts: null, tarseekhDone: null, murajaahDone: null, pointsToday: 0 };
  }

  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const [att, sess, txns] = await Promise.all([
    db.attendance.findFirst({ where: { studentId: student.id, date: dayStart }, select: { status: true } }),
    db.dailySession.findFirst({ where: { studentId: student.id, date: dayStart }, select: { hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true, hifzAttempts: true, tarseekhDone: true, murajaahDone: true } }),
    db.pointTransaction.findMany({ where: { studentId: student.id, createdAt: { gte: dayStart, lt: dayEnd } }, select: { amount: true } }),
  ]);

  const hifzRange =
    sess?.hifzFromSurah != null && sess.hifzToSurah != null
      ? `${sess.hifzFromSurah}:${sess.hifzFromAyah ?? 1} → ${sess.hifzToSurah}:${sess.hifzToAyah ?? 1}`
      : null;

  return {
    kind: "student",
    date,
    attendanceStatus: att?.status ?? null,
    hifzRange,
    hifzAttempts: sess?.hifzAttempts ?? null,
    tarseekhDone: sess?.tarseekhDone ?? null,
    murajaahDone: sess?.murajaahDone ?? null,
    pointsToday: txns.reduce((s, t) => s + t.amount, 0),
  };
}

// ─── تقرير مُدّكِر ────────────────────────────────────────────────────────────

export interface MuddakirHafizRow {
  studentId: string;
  name: string;
  dayStatus: MuddakirDayStatus | null;
  newPages: string | null;
  ribatDone: boolean | null;
  reviewDone: boolean | null;
}

export interface MuddakirDailyReport {
  kind: "muddakir";
  date: string;
  total: number;
  completed: number;
  rows: MuddakirHafizRow[];
}

export async function getMuddakirReport(
  supervisorUserId: string,
  date: string,
  db: PrismaClient = prisma,
): Promise<MuddakirDailyReport> {
  const dayDate = makkahDayStart(new Date(`${date}T12:00:00+03:00`));

  const supervisions = await db.muddakirSupervision.findMany({
    where: { supervisorId: supervisorUserId, endedAt: null },
    select: { studentId: true },
  });

  const studentIds = supervisions.map((s) => s.studentId);
  if (studentIds.length === 0) return { kind: "muddakir", date, total: 0, completed: 0, rows: [] };

  const [students, days] = await Promise.all([
    db.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, user: { select: { nameAsInId: true } } },
    }),
    db.muddakirDay.findMany({
      where: { studentId: { in: studentIds }, dayDate },
      select: { studentId: true, status: true, newFromPage: true, newToPage: true, ribatDone: true, reviewDone: true },
    }),
  ]);

  const nameMap = new Map(students.map((s) => [s.id, s.user.nameAsInId]));
  const dayMap = new Map(days.map((d) => [d.studentId, d]));

  const rows: MuddakirHafizRow[] = studentIds.map((sid) => {
    const d = dayMap.get(sid);
    return {
      studentId: sid,
      name: nameMap.get(sid) ?? sid,
      dayStatus: d?.status ?? null,
      newPages: d?.newFromPage != null && d.newToPage != null ? `${d.newFromPage} → ${d.newToPage}` : null,
      ribatDone: d?.ribatDone ?? null,
      reviewDone: d?.reviewDone ?? null,
    };
  });

  const completed = days.filter((d) => d.status === MuddakirDayStatus.COMPLETE).length;

  return { kind: "muddakir", date, total: studentIds.length, completed, rows };
}

export type DailyReport =
  | TeacherDailyReport[]
  | SupervisorDailyReport
  | AdminDailyReport
  | StudentDailyReport
  | MuddakirDailyReport;

export function reportToday(): string {
  return makkahDayDate(new Date());
}
