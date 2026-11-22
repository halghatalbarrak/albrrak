/**
 * التحليلات الموحّدة — منطق الخادم.
 * النطاق بالدور: مدير/مشرف كامل · معلّم حلقته فقط · مانح مجمَّع بلا أسماء.
 */
import {
  AttendanceStatus,
  CertificateTemplate,
  MuddakirDayStatus,
  PrismaClient,
  Role,
  StudentState,
} from "@prisma/client";
import { makkahDayDate, makkahDayStart } from "@/lib/makkah-day";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type AnalyticsPeriod = "day" | "week" | "month";

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

export interface ASeriesPoint {
  label: string;
  present: number;
  total: number;
  sessions: number;
}

export interface ACircleRow {
  circleId: string;
  name: string;
  studentCount: number;
  present: number;
  total: number;
  sessions: number;
}

export interface CirclesOverview {
  activeStudents: number;
  attendanceRate: number | null;
  masteredSessions: number;
  khatmCount: number;
  struggling: number;
  series: ASeriesPoint[];
  circles: ACircleRow[];
}

export interface MuddakirOverview {
  activeHuffaz: number;
  completedDaysInPeriod: number;
  series: { label: string; completed: number; total: number }[];
}

export interface AnalyticsOverview {
  circles: CirclesOverview | null;
  muddakir: MuddakirOverview | null;
  donorMode: boolean;
  period: AnalyticsPeriod;
}

function generateBuckets(period: AnalyticsPeriod, now: Date) {
  const today = makkahDayStart(now);
  const buckets: { label: string; from: Date; to: Date }[] = [];

  if (period === "day") {
    for (let i = 6; i >= 0; i--) {
      const from = new Date(today);
      from.setDate(from.getDate() - i);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      buckets.push({ label: makkahDayDate(from).slice(5), from, to });
    }
  } else if (period === "week") {
    for (let i = 7; i >= 0; i--) {
      const from = new Date(today);
      from.setDate(from.getDate() - i * 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      buckets.push({ label: makkahDayDate(from).slice(5), from, to });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const from = new Date(today);
      from.setDate(1);
      from.setMonth(from.getMonth() - i);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      const label = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ label, from, to });
    }
  }

  return buckets;
}

async function getTeacherCircleIds(actorId: string, db: PrismaClient): Promise<string[]> {
  const rows = await db.circleTeacher.findMany({
    where: { teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  return rows.map((r) => r.circleId);
}

async function buildCirclesOverview(
  circleIds: string[] | null,
  buckets: ReturnType<typeof generateBuckets>,
  db: PrismaClient,
  donorMode: boolean,
): Promise<CirclesOverview> {
  const rangeFrom = buckets[0].from;
  const rangeTo = buckets[buckets.length - 1].to;

  const circleFilter = circleIds ? { in: circleIds } : undefined;

  const [attRows, sessRows, activeStudents, khatmCount, struggling] = await Promise.all([
    db.attendance.findMany({
      where: { date: { gte: rangeFrom, lt: rangeTo }, ...(circleFilter ? { circleId: circleFilter } : {}) },
      select: { date: true, status: true, circleId: true },
    }),
    db.dailySession.findMany({
      where: { date: { gte: rangeFrom, lt: rangeTo }, hifzMastered: true, ...(circleFilter ? { circleId: circleFilter } : {}) },
      select: { date: true, circleId: true },
    }),
    db.student.count({
      where: {
        deletedAt: null,
        state: { in: ACTIVE_STATES },
        ...(circleIds ? { enrollments: { some: { circleId: { in: circleIds }, endedAt: null } } } : {}),
      },
    }),
    db.certificate.count({ where: { template: CertificateTemplate.KHATM, revokedAt: null } }),
    db.dailySession.count({
      where: {
        date: { gte: rangeFrom, lt: rangeTo },
        hifzAttempts: { gte: 2 },
        hifzMastered: false,
        ...(circleFilter ? { circleId: circleFilter } : {}),
      },
    }),
  ]);

  const totalAtt = attRows.length;
  const presentAtt = attRows.filter((a) => PRESENT_STATUSES.includes(a.status)).length;

  const series: ASeriesPoint[] = buckets.map((b) => {
    const att = attRows.filter((a) => a.date >= b.from && a.date < b.to);
    const sess = sessRows.filter((s) => s.date >= b.from && s.date < b.to);
    return {
      label: b.label,
      present: att.filter((a) => PRESENT_STATUSES.includes(a.status)).length,
      total: att.length,
      sessions: sess.length,
    };
  });

  let circles: ACircleRow[] = [];
  if (!donorMode) {
    const allCircles = await db.circle.findMany({
      where: { deletedAt: null, ...(circleFilter ? { id: circleFilter } : {}) },
      select: { id: true, nameAr: true },
    });
    const studentCounts = await db.enrollment.groupBy({
      by: ["circleId"],
      where: { circleId: { in: allCircles.map((c) => c.id) }, endedAt: null },
      _count: { studentId: true },
    });
    circles = allCircles.map((c) => {
      const att = attRows.filter((a) => a.circleId === c.id);
      const sess = sessRows.filter((s) => s.circleId === c.id);
      const sc = studentCounts.find((x) => x.circleId === c.id);
      return {
        circleId: c.id,
        name: c.nameAr,
        studentCount: sc?._count.studentId ?? 0,
        present: att.filter((a) => PRESENT_STATUSES.includes(a.status)).length,
        total: att.length,
        sessions: sess.length,
      };
    });
  }

  return {
    activeStudents,
    attendanceRate: totalAtt > 0 ? presentAtt / totalAtt : null,
    masteredSessions: sessRows.length,
    khatmCount,
    struggling,
    series,
    circles,
  };
}

async function buildMuddakirOverview(
  buckets: ReturnType<typeof generateBuckets>,
  db: PrismaClient,
): Promise<MuddakirOverview> {
  const rangeFrom = buckets[0].from;
  const rangeTo = buckets[buckets.length - 1].to;

  const [activeHuffaz, dayRows] = await Promise.all([
    db.muddakirProfile.count({ where: { mode: "ACTIVE" } }),
    db.muddakirDay.findMany({
      where: { dayDate: { gte: rangeFrom, lt: rangeTo } },
      select: { dayDate: true, status: true },
    }),
  ]);

  const series = buckets.map((b) => {
    const days = dayRows.filter((d) => d.dayDate >= b.from && d.dayDate < b.to);
    return {
      label: b.label,
      completed: days.filter((d) => d.status === MuddakirDayStatus.COMPLETE).length,
      total: days.length,
    };
  });

  const completedDaysInPeriod = dayRows.filter((d) => d.status === MuddakirDayStatus.COMPLETE).length;

  return { activeHuffaz, completedDaysInPeriod, series };
}

export async function getAnalyticsOverview(
  actorRoles: Role[],
  actorId: string,
  period: AnalyticsPeriod,
  now: Date = new Date(),
  db: PrismaClient = defaultPrisma,
): Promise<AnalyticsOverview> {
  const hasRole = (r: Role) => actorRoles.includes(r);
  const isAdmin = hasRole(Role.SUPER_ADMIN) || hasRole(Role.CIRCLE_MANAGER) || hasRole(Role.TECH_ADMIN);
  const isTeacher = hasRole(Role.TEACHER) && !isAdmin;
  const isDonorOnly = hasRole(Role.DONOR) && !isAdmin && !isTeacher;

  const buckets = generateBuckets(period, now);

  if (isDonorOnly) {
    const circles = await buildCirclesOverview(null, buckets, db, true);
    const muddakir = await buildMuddakirOverview(buckets, db);
    return { circles, muddakir, donorMode: true, period };
  }

  const circleIds = isTeacher ? await getTeacherCircleIds(actorId, db) : null;
  const circles = await buildCirclesOverview(circleIds, buckets, db, false);
  const muddakir = isAdmin ? await buildMuddakirOverview(buckets, db) : null;

  return { circles, muddakir, donorMode: false, period };
}
