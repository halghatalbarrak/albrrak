/**
 * ملخّص الابن لوليّ الأمر — سجل الحضور + متوسط الحلقة.
 * الأمان: يُتحقَّق أنّ وليّ الأمر مرتبطٌ بالطالب قبل أيّ استعلام.
 */
import { AttendanceStatus, PrismaClient } from "@prisma/client";
import { makkahDayStart, makkahDayDate } from "@/lib/makkah-day";
import { prisma as defaultPrisma } from "@/lib/prisma";

export interface AttendanceDay {
  date: string;
  status: "PRESENT" | "LATE" | "LEFT_EARLY" | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED" | "PRE_EXCUSED" | "LEFT_NO_PERMISSION" | null;
}

export interface ChildSummary {
  studentId: string;
  name: string;
  history: AttendanceDay[];
  circleAvgRate: number | null;
  presentCount: number;
  absentCount: number;
  totalDays: number;
}

const PRESENT_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.LEFT_EARLY,
];

/** يتحقّق أنّ الوليّ مرتبطٌ بالطالب — IDOR guard. */
export async function assertGuardianOwnsStudent(
  guardianId: string,
  studentId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const link = await db.guardianLink.findFirst({
    where: { guardianId, studentId, status: { not: "UNLINKED" } },
    select: { id: true },
  });
  if (!link) {
    throw new Error("FORBIDDEN");
  }
}

export async function getChildSummary(
  guardianId: string,
  studentId: string,
  now: Date = new Date(),
  db: PrismaClient = defaultPrisma,
): Promise<ChildSummary> {
  await assertGuardianOwnsStudent(guardianId, studentId, db);

  const today = makkahDayStart(now);
  const from = new Date(today);
  from.setDate(from.getDate() - 29); // آخر ٣٠ يومًا

  const [student, attRows] = await Promise.all([
    db.student.findUniqueOrThrow({
      where: { id: studentId },
      select: {
        user: { select: { nameAsInId: true } },
        enrollments: {
          where: { endedAt: null },
          select: { circleId: true },
          take: 1,
        },
      },
    }),
    db.attendance.findMany({
      where: { studentId, date: { gte: from, lte: today } },
      select: { date: true, status: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const attMap = new Map(attRows.map((a) => [makkahDayDate(a.date), a.status]));

  // بناء مصفوفة ٣٠ يومًا
  const history: AttendanceDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = makkahDayDate(d);
    const status = attMap.get(iso) ?? null;
    history.push({ date: iso, status: status as AttendanceDay["status"] });
  }

  const present = attRows.filter((a) => PRESENT_STATUSES.includes(a.status)).length;
  const total = attRows.length;

  // متوسط الحلقة (بلا أسماء)
  let circleAvgRate: number | null = null;
  const circleId = student.enrollments[0]?.circleId;
  if (circleId) {
    const circleAtt = await db.attendance.findMany({
      where: { circleId, date: { gte: from, lte: today } },
      select: { status: true },
    });
    const cTotal = circleAtt.length;
    const cPresent = circleAtt.filter((a) => PRESENT_STATUSES.includes(a.status)).length;
    circleAvgRate = cTotal > 0 ? cPresent / cTotal : null;
  }

  return {
    studentId,
    name: student.user.nameAsInId,
    history,
    circleAvgRate,
    presentCount: present,
    absentCount: total - present,
    totalDays: total,
  };
}
