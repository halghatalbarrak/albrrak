/**
 * إحصاءات المانح — مؤشّراتٌ مجمّعةٌ فقط. لا اسم طالب، لا معرّف، لا بيانٌ شخصيّ.
 */
import {
  AttendanceStatus,
  CertificateTemplate,
  PrismaClient,
  StudentState,
} from "@prisma/client";
import { makkahDayStart } from "@/lib/makkah-day";
import { prisma as defaultPrisma } from "@/lib/prisma";

const ACTIVE_STATES: StudentState[] = [
  StudentState.IN_QAIDAH,
  StudentState.AWAITING_PACE_TEST,
  StudentState.PACE_RETEST_SCHEDULED,
  StudentState.IN_MARAQI,
  StudentState.COMPLETED,
];

const PRESENT_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.LEFT_EARLY,
];

function monthStart(monthsAgo: number, now: Date): Date {
  const d = makkahDayStart(now);
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  attendanceCount: number;
  presentCount: number;
  sessionCount: number;
}

export interface DonorStats {
  studentCount: number;
  circleCount: number;
  attendanceRate30d: number | null; // 0–1 أو null إن لا بيانات
  masteredSessionCount: number; // جلسات حفظٍ مُتقَنة (٣٠ يوماً)
  khatmStudentCount: number; // طلاب حصلوا على شهادة KHATM
  monthlyTrend: MonthlyPoint[];
}

export async function getDonorStats(
  now: Date = new Date(),
  db: PrismaClient = defaultPrisma,
): Promise<DonorStats> {
  const start30 = makkahDayStart(now);
  start30.setDate(start30.getDate() - 30);

  const [
    studentCount,
    circleCount,
    attendance30,
    masteredSessionCount,
    khatmStudentCount,
  ] = await Promise.all([
    db.student.count({ where: { deletedAt: null, state: { in: ACTIVE_STATES } } }),
    db.circle.count({ where: { deletedAt: null } }),
    db.attendance.findMany({
      where: { date: { gte: start30 } },
      select: { status: true },
    }),
    db.dailySession.count({
      where: { date: { gte: start30 }, hifzMastered: true },
    }),
    db.certificate.count({
      where: { template: CertificateTemplate.KHATM, revokedAt: null },
    }),
  ]);

  const totalAtt = attendance30.length;
  const presentAtt = attendance30.filter((a) =>
    PRESENT_STATUSES.includes(a.status),
  ).length;
  const attendanceRate30d = totalAtt > 0 ? presentAtt / totalAtt : null;

  // الاتجاه الشهريّ — آخر ٦ أشهر
  const monthlyTrend: MonthlyPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const from = monthStart(i + 1, now);
    const to = monthStart(i, now);
    const [attRows, sessionCount] = await Promise.all([
      db.attendance.findMany({
        where: { date: { gte: from, lt: to } },
        select: { status: true },
      }),
      db.dailySession.count({ where: { date: { gte: from, lt: to } } }),
    ]);
    const label = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrend.push({
      month: label,
      attendanceCount: attRows.length,
      presentCount: attRows.filter((a) => PRESENT_STATUSES.includes(a.status)).length,
      sessionCount,
    });
  }

  return {
    studentCount,
    circleCount,
    attendanceRate30d,
    masteredSessionCount,
    khatmStudentCount,
    monthlyTrend,
  };
}
