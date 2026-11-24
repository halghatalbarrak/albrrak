/**
 * لوحة عمل المدير — منطق الخادم.
 * النطاق بالدور: مدير/مشرف كامل · معلّم حلقته فقط · مانح مجمَّع بلا أسماء.
 */
import {
  AttendanceStatus,
  MuddakirDayStatus,
  PrismaClient,
  Role,
  StudentState,
} from "@prisma/client";
import { makkahDayDate, makkahDayStart } from "@/lib/makkah-day";
import { surahName } from "@/lib/surah-names";
import { prisma as defaultPrisma } from "@/lib/prisma";

// ─── الثوابت ─────────────────────────────────────────────────────────────────

const ACTIVE_STATES: StudentState[] = [
  StudentState.IN_QAIDAH,
  StudentState.AWAITING_PACE_TEST,
  StudentState.PACE_RETEST_SCHEDULED,
  StudentState.IN_MARAQI,
  StudentState.COMPLETED,
];

const IN_MARAQI_STATES: StudentState[] = [
  StudentState.IN_MARAQI,
];

const PRESENT_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.LEFT_EARLY,
];

/** يوم دراسيّ في المملكة (الأحد-الخميس). التاريخ @db.Date = منتصف ليل UTC. */
function isSchoolDay(date: Date): boolean {
  const dow = date.getUTCDay(); // 0=الأحد…6=السبت
  return dow >= 0 && dow <= 4;
}

/** آخر N يوم دراسيّ قبل اليوم (بما فيه اليوم إن كان دراسيّاً). */
function lastNSchoolDays(today: Date, n: number): Date[] {
  const days: Date[] = [];
  const d = new Date(today);
  while (days.length < n) {
    if (isSchoolDay(d)) days.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

// ─── الأنواع ──────────────────────────────────────────────────────────────────

export type FollowUpCode =
  | "ABSENT_CONSECUTIVE"
  | "REPEATED_SECTION"
  | "NO_HIFZ_PROGRESS"
  | "NO_GUARDIAN"
  | "NO_TRACK"
  | "AWAITING_PACE"
  | "MUDDAKIR_SHORTFALL"
  | "MUDDAKIR_UNCONFIRMED";

export interface FollowUpStudent {
  studentId: string;
  userId: string;
  name: string;
  reasons: FollowUpCode[];
  circleId: string;
  circleName: string;
  teacherName: string;
}

export interface TodayCircleCard {
  circleId: string;
  circleName: string;
  teacherName: string;
  teacherUserId: string;
  present: number;
  total: number;
  recited: number;
  notRecited: number;
  opened: boolean;
}

export interface StudentRow {
  studentId: string;
  userId: string;
  name: string;
  circleId: string;
  circleName: string;
  teacherName: string;
  currentSurahNum: number | null;
  currentAyahNum: number | null;
  currentSurahName: string | null;
  maraqiStage: string | null;
  monthlyMasteredSessions: number;
  monthlyLines: number;
  transitionRate: number | null;
  circleAvgTransitionRate: number | null;
  attendancePct: number | null;
  masteryFirstAttemptPct: number | null;
  khatmDateIso: string | null;
}

export interface CircleCompRow {
  circleId: string;
  circleName: string;
  teacherName: string;
  teacherUserId: string;
  studentCount: number;
  attendancePct: number | null;
  monthlyMasteredSessions: number;
  avgTransitionRate: number | null;
  masteryPct: number | null;
  struggling: number;
}

export interface ChartPoint {
  dateIso: string;
  hijriLabel: string;
  present: number;
  total: number;
  mastered: number;
}

export interface MuddakirFollowUp {
  studentId: string;
  userId: string;
  name: string;
  supervisorName: string | null;
  reasons: ("SHORTFALL" | "UNCONFIRMED")[];
}

export interface DashboardData {
  followUp: FollowUpStudent[];
  todayCircles: TodayCircleCard[];
  students: StudentRow[];
  circleComparison: CircleCompRow[];
  charts: ChartPoint[];
  muddakirFollowUp: MuddakirFollowUp[];
  donorMode: boolean;
  todayIso: string;
}

// ─── مساعدات الدور ────────────────────────────────────────────────────────────

function roleFlags(roles: Role[]) {
  const has = (r: Role) => roles.includes(r);
  const isAdmin = has(Role.SUPER_ADMIN) || has(Role.CIRCLE_MANAGER) || has(Role.TECH_ADMIN);
  const isTeacher = has(Role.TEACHER) && !isAdmin;
  const isDonor = has(Role.DONOR) && !isAdmin && !isTeacher;
  return { isAdmin, isTeacher, isDonor };
}

async function getTeacherCircleIds(actorId: string, db: PrismaClient): Promise<string[]> {
  const rows = await db.circleTeacher.findMany({
    where: { teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  return rows.map((r) => r.circleId);
}

// ─── جلب الحلقات وطلّابها ────────────────────────────────────────────────────

interface CircleInfo {
  id: string;
  nameAr: string;
  teacherName: string;
  teacherUserId: string;
}

async function getActiveCircles(
  circleIds: string[] | null,
  db: PrismaClient,
): Promise<CircleInfo[]> {
  const circles = await db.circle.findMany({
    where: {
      deletedAt: null,
      ...(circleIds ? { id: { in: circleIds } } : {}),
    },
    select: {
      id: true,
      nameAr: true,
      teachers: {
        where: { endedAt: null },
        select: { teacher: { select: { id: true, nameAsInId: true } } },
        take: 1,
      },
    },
    orderBy: { nameAr: "asc" },
  });
  return circles.map((c) => ({
    id: c.id,
    nameAr: c.nameAr,
    teacherName: c.teachers[0]?.teacher.nameAsInId ?? "—",
    teacherUserId: c.teachers[0]?.teacher.id ?? "",
  }));
}

interface StudentBase {
  studentId: string;
  userId: string;
  name: string;
  state: StudentState;
  circleId: string;
  circleName: string;
  teacherName: string;
}

async function getActiveStudentsInCircles(
  circleIds: string[] | null,
  db: PrismaClient,
): Promise<StudentBase[]> {
  const enrollments = await db.enrollment.findMany({
    where: {
      endedAt: null,
      circleId: circleIds ? { in: circleIds } : { not: null },
      student: {
        deletedAt: null,
        state: { in: ACTIVE_STATES },
      },
    },
    select: {
      circleId: true,
      circle: {
        select: {
          nameAr: true,
          teachers: {
            where: { endedAt: null },
            select: { teacher: { select: { id: true, nameAsInId: true } } },
            take: 1,
          },
        },
      },
      student: {
        select: {
          id: true,
          state: true,
          user: { select: { id: true, nameAsInId: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const result: StudentBase[] = [];
  for (const e of enrollments) {
    if (!e.circleId || !e.circle || seen.has(e.student.id)) continue;
    seen.add(e.student.id);
    result.push({
      studentId: e.student.id,
      userId: e.student.user.id,
      name: e.student.user.nameAsInId,
      state: e.student.state,
      circleId: e.circleId,
      circleName: e.circle.nameAr,
      teacherName: e.circle.teachers[0]?.teacher.nameAsInId ?? "—",
    });
  }
  return result;
}

// ─── القسم ١: يحتاجون متابعة ─────────────────────────────────────────────────

async function buildFollowUp(
  students: StudentBase[],
  today: Date,
  db: PrismaClient,
): Promise<FollowUpStudent[]> {
  if (students.length === 0) return [];

  const studentIds = students.map((s) => s.studentId);

  // آخر ١٤ يوم من التواريخ
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  // جلب الحضور والجلسات دفعةً واحدة
  const [attRows, sessRows, trackRows, guardianCounts, paceWaitIds] = await Promise.all([
    db.attendance.findMany({
      where: { studentId: { in: studentIds }, date: { gte: fourteenDaysAgo } },
      select: { studentId: true, date: true, status: true },
      orderBy: { date: "desc" },
    }),
    db.dailySession.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: fourteenDaysAgo },
        hifzFromSurah: { not: null },
      },
      select: {
        studentId: true, date: true,
        hifzFromSurah: true, hifzFromAyah: true,
        hifzAttempts: true, hifzMastered: true,
      },
      orderBy: { date: "desc" },
    }),
    db.trackAssignment.findMany({
      where: { studentId: { in: studentIds }, endedAt: null },
      select: { studentId: true },
    }),
    db.guardianLink.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, status: "ACTIVE" },
      _count: { guardianId: true },
    }),
    // طلّاب ينتظرون اختبار المستوى
    Promise.resolve(
      students
        .filter((s) => s.state === StudentState.AWAITING_PACE_TEST || s.state === StudentState.PACE_RETEST_SCHEDULED)
        .map((s) => s.studentId),
    ),
  ]);

  const attByStudent = new Map<string, { date: Date; isPresent: boolean }[]>();
  for (const a of attRows) {
    if (!attByStudent.has(a.studentId)) attByStudent.set(a.studentId, []);
    attByStudent.get(a.studentId)!.push({
      date: a.date,
      isPresent: PRESENT_STATUSES.includes(a.status as AttendanceStatus),
    });
  }

  const sessByStudent = new Map<string, typeof sessRows[0][]>();
  for (const s of sessRows) {
    if (!sessByStudent.has(s.studentId)) sessByStudent.set(s.studentId, []);
    sessByStudent.get(s.studentId)!.push(s);
  }

  const hasTrack = new Set(trackRows.map((t) => t.studentId));
  const hasGuardian = new Set(guardianCounts.filter((g) => g._count.guardianId > 0).map((g) => g.studentId));
  const paceWaitSet = new Set(paceWaitIds);

  // آخر ٧ أيّام دراسيّة
  const last7SchoolDays = lastNSchoolDays(makkahDayStart(today), 7);

  const result: FollowUpStudent[] = [];

  for (const s of students) {
    const reasons: FollowUpCode[] = [];

    // ١. غياب متتالٍ ≥ ٢ أيّام دراسيّة
    const att = attByStudent.get(s.studentId) ?? [];
    const schoolDayAtt = last7SchoolDays.map((d) => {
      const a = att.find((a) => a.date.getTime() === d.getTime());
      return a ? a.isPresent : null; // null = لا سجلّ
    });
    let consecutiveAbsent = 0;
    for (const p of schoolDayAtt) {
      if (p === false) {
        consecutiveAbsent++;
      } else if (p === true) {
        consecutiveAbsent = 0;
      }
      // null (لا سجلّ) → لا تُعدّ غياباً
    }
    if (consecutiveAbsent >= 2) reasons.push("ABSENT_CONSECUTIVE");

    // ٢. مقطع متكرّر (٣ محاولات فأكثر، نفس المقطع، يومَين فأكثر)
    const sess = sessByStudent.get(s.studentId) ?? [];
    const failedSess = sess.filter((x) => x.hifzMastered === false && (x.hifzAttempts ?? 0) >= 3);
    if (failedSess.length >= 2) {
      // تحقّق أنّ نفس المقطع (hifzFromSurah) متكرّر في يومَين مختلفَين
      const bySurah = new Map<number, Set<string>>();
      for (const f of failedSess) {
        if (f.hifzFromSurah == null) continue;
        if (!bySurah.has(f.hifzFromSurah)) bySurah.set(f.hifzFromSurah, new Set());
        bySurah.get(f.hifzFromSurah)!.add(makkahDayDate(f.date));
      }
      for (const days of bySurah.values()) {
        if (days.size >= 2) { reasons.push("REPEATED_SECTION"); break; }
      }
    }

    // ٣. لا تقدّم ٧ أيام دراسيّة (IN_MARAQI فقط)
    if (IN_MARAQI_STATES.includes(s.state)) {
      const hasProgressInLast7 = last7SchoolDays.some((d) =>
        sess.some((x) => x.hifzFromSurah != null && x.date.getTime() === d.getTime()),
      );
      if (!hasProgressInLast7) reasons.push("NO_HIFZ_PROGRESS");
    }

    // ٤. إعداد ناقص
    if (!hasGuardian.has(s.studentId)) reasons.push("NO_GUARDIAN");
    if (!hasTrack.has(s.studentId) && IN_MARAQI_STATES.includes(s.state)) reasons.push("NO_TRACK");
    if (paceWaitSet.has(s.studentId)) reasons.push("AWAITING_PACE");

    if (reasons.length > 0) {
      result.push({
        studentId: s.studentId,
        userId: s.userId,
        name: s.name,
        reasons,
        circleId: s.circleId,
        circleName: s.circleName,
        teacherName: s.teacherName,
      });
    }
  }

  return result;
}

// ─── القسم ٢: اليوم في الحلقات ───────────────────────────────────────────────

async function buildTodayCircles(
  circles: CircleInfo[],
  today: Date,
  db: PrismaClient,
): Promise<TodayCircleCard[]> {
  const circleIds = circles.map((c) => c.id);
  if (circleIds.length === 0) return [];

  const todayMs = makkahDayStart(today).getTime();
  const tomorrowMs = todayMs + 86_400_000;

  const [enrollCounts, attRows, sessRows] = await Promise.all([
    db.enrollment.groupBy({
      by: ["circleId"],
      where: {
        circleId: { in: circleIds },
        endedAt: null,
        student: { deletedAt: null, state: { in: ACTIVE_STATES } },
      },
      _count: { studentId: true },
    }),
    db.attendance.findMany({
      where: {
        circleId: { in: circleIds },
        date: { gte: new Date(todayMs), lt: new Date(tomorrowMs) },
      },
      select: { circleId: true, studentId: true, status: true },
    }),
    db.dailySession.findMany({
      where: {
        circleId: { in: circleIds },
        date: { gte: new Date(todayMs), lt: new Date(tomorrowMs) },
        hifzFromSurah: { not: null },
      },
      select: { circleId: true, studentId: true },
    }),
  ]);

  const enrollMap = new Map(enrollCounts.map((e) => [e.circleId, e._count.studentId]));

  return circles.map((c) => {
    const att = attRows.filter((a) => a.circleId === c.id);
    const sess = sessRows.filter((s) => s.circleId === c.id);
    const present = att.filter((a) => PRESENT_STATUSES.includes(a.status as AttendanceStatus)).length;
    const total = enrollMap.get(c.id) ?? 0;
    const reciters = new Set(sess.map((s) => s.studentId));
    const recited = reciters.size;
    const opened = att.length > 0 || sess.length > 0;
    return {
      circleId: c.id,
      circleName: c.nameAr,
      teacherName: c.teacherName,
      teacherUserId: c.teacherUserId,
      present,
      total,
      recited,
      notRecited: Math.max(0, present - recited),
      opened,
    };
  });
}

// ─── القسم ٣: جدول الطلاب ────────────────────────────────────────────────────

async function buildStudentsTable(
  students: StudentBase[],
  today: Date,
  db: PrismaClient,
): Promise<StudentRow[]> {
  if (students.length === 0) return [];

  const studentIds = students.map((s) => s.studentId);
  const todayIso = makkahDayDate(today);
  const monthStart = new Date(Date.UTC(
    parseInt(todayIso.slice(0, 4)),
    parseInt(todayIso.slice(5, 7)) - 1,
    1,
  ));
  const thirtyDaysAgo = new Date(makkahDayStart(today));
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  // جلب كل البيانات دفعةً واحدة
  const [placements, lastSessions, monthlySess, allSessForMastery, att30, tracks, stages] = await Promise.all([
    db.maraqiPlacement.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, reachedSurah: true, reachedAyah: true },
    }),
    db.dailySession.findMany({
      where: {
        studentId: { in: studentIds },
        hifzToSurah: { not: null },
        hifzMastered: true,
      },
      select: { studentId: true, hifzToSurah: true, hifzToAyah: true, date: true },
      orderBy: { date: "desc" },
    }),
    db.dailySession.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: monthStart },
        hifzMastered: true,
      },
      select: { studentId: true },
    }),
    db.dailySession.findMany({
      where: {
        studentId: { in: studentIds },
        hifzMastered: { not: null },
        hifzAttempts: { not: null },
      },
      select: { studentId: true, hifzMastered: true, hifzAttempts: true },
    }),
    db.attendance.findMany({
      where: { studentId: { in: studentIds }, date: { gte: thirtyDaysAgo } },
      select: { studentId: true, status: true },
    }),
    db.trackAssignment.findMany({
      where: { studentId: { in: studentIds }, endedAt: null },
      select: {
        studentId: true,
        track: { select: { linesPerDay: true } },
      },
    }),
    db.stageProgress.findMany({
      where: {
        studentId: { in: studentIds },
        state: { in: ["IN_PROGRESS", "AWAITING_HASAD", "REPAIRING"] },
      },
      select: { studentId: true, stage: { select: { nameAr: true } } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  // بناء خرائط
  const linesMap = new Map(tracks.map((t) => [t.studentId, t.track.linesPerDay]));

  // أبعد موضع لكل طالب
  const frontierMap = new Map<string, { surah: number; ayah: number }>();
  for (const s of lastSessions) {
    if (s.hifzToSurah == null) continue;
    const prev = frontierMap.get(s.studentId);
    if (!prev || s.hifzToSurah > prev.surah || (s.hifzToSurah === prev.surah && (s.hifzToAyah ?? 1) > prev.ayah)) {
      frontierMap.set(s.studentId, { surah: s.hifzToSurah, ayah: s.hifzToAyah ?? 1 });
    }
  }
  // MaraqiPlacement أيضاً مصدر للموضع
  for (const p of placements) {
    if (p.reachedSurah == null) continue;
    const prev = frontierMap.get(p.studentId);
    if (!prev || p.reachedSurah > prev.surah) {
      frontierMap.set(p.studentId, { surah: p.reachedSurah, ayah: p.reachedAyah ?? 1 });
    }
  }

  // الجلسات الشهريّة لكل طالب
  const monthlyMap = new Map<string, number>();
  for (const s of monthlySess) {
    monthlyMap.set(s.studentId, (monthlyMap.get(s.studentId) ?? 0) + 1);
  }

  // معدّل الإتقان من المحاولة الأولى
  const masteryMap = new Map<string, { first: number; total: number }>();
  for (const s of allSessForMastery) {
    if (s.hifzMastered === null) continue;
    if (!masteryMap.has(s.studentId)) masteryMap.set(s.studentId, { first: 0, total: 0 });
    const m = masteryMap.get(s.studentId)!;
    if (s.hifzMastered) {
      m.total++;
      if ((s.hifzAttempts ?? 2) === 1) m.first++;
    }
  }

  // نسبة الحضور
  const attMap = new Map<string, { present: number; total: number }>();
  for (const a of att30) {
    if (!attMap.has(a.studentId)) attMap.set(a.studentId, { present: 0, total: 0 });
    const m = attMap.get(a.studentId)!;
    m.total++;
    if (PRESENT_STATUSES.includes(a.status as AttendanceStatus)) m.present++;
  }

  // مرحلة مراقي
  const stageMap = new Map(stages.map((s) => [s.studentId, s.stage.nameAr]));

  // بناء الصفوف
  const rows: StudentRow[] = students.map((s) => {
    const frontier = frontierMap.get(s.studentId);
    const monthlyCount = monthlyMap.get(s.studentId) ?? 0;
    const linesPerDay = linesMap.get(s.studentId) ?? 15;
    const mastery = masteryMap.get(s.studentId);
    const attData = attMap.get(s.studentId);

    const transitionRate = mastery && mastery.total > 0
      ? mastery.first / mastery.total
      : null;
    const attendancePct = attData && attData.total > 0
      ? attData.present / attData.total
      : null;
    const masteryPct = mastery && mastery.total > 0
      ? mastery.first / mastery.total
      : null;

    return {
      studentId: s.studentId,
      userId: s.userId,
      name: s.name,
      circleId: s.circleId,
      circleName: s.circleName,
      teacherName: s.teacherName,
      currentSurahNum: frontier?.surah ?? null,
      currentAyahNum: frontier?.ayah ?? null,
      currentSurahName: frontier ? (surahName(frontier.surah) || null) : null,
      maraqiStage: stageMap.get(s.studentId) ?? null,
      monthlyMasteredSessions: monthlyCount,
      monthlyLines: Math.round(monthlyCount * linesPerDay),
      transitionRate,
      circleAvgTransitionRate: null, // يُحسب لاحقاً بعد جمع كل الطلاب
      attendancePct,
      masteryFirstAttemptPct: masteryPct,
      khatmDateIso: null, // تُحسب في الصفحة الفرديّة
    };
  });

  // حساب متوسّط الحلقة
  const circleRates = new Map<string, number[]>();
  for (const r of rows) {
    if (r.transitionRate === null) continue;
    if (!circleRates.has(r.circleId)) circleRates.set(r.circleId, []);
    circleRates.get(r.circleId)!.push(r.transitionRate);
  }
  const circleAvg = new Map<string, number>();
  for (const [cId, rates] of circleRates) {
    circleAvg.set(cId, rates.reduce((a, b) => a + b, 0) / rates.length);
  }
  for (const r of rows) {
    r.circleAvgTransitionRate = circleAvg.get(r.circleId) ?? null;
  }

  return rows;
}

// ─── القسم ٤: مقارنة الحلقات ─────────────────────────────────────────────────

function buildCircleComparison(
  circles: CircleInfo[],
  students: StudentRow[],
): CircleCompRow[] {
  return circles.map((c) => {
    const ss = students.filter((s) => s.circleId === c.id);
    const attValues = ss.map((s) => s.attendancePct).filter((v): v is number => v !== null);
    const transValues = ss.map((s) => s.transitionRate).filter((v): v is number => v !== null);
    const masteryValues = ss.map((s) => s.masteryFirstAttemptPct).filter((v): v is number => v !== null);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const struggling = ss.filter((s) => s.attendancePct !== null && s.attendancePct < 0.6).length;
    return {
      circleId: c.id,
      circleName: c.nameAr,
      teacherName: c.teacherName,
      teacherUserId: c.teacherUserId,
      studentCount: ss.length,
      attendancePct: avg(attValues),
      monthlyMasteredSessions: ss.reduce((a, s) => a + s.monthlyMasteredSessions, 0),
      avgTransitionRate: avg(transValues),
      masteryPct: avg(masteryValues),
      struggling,
    };
  });
}

// ─── الرسوم البيانيّة ─────────────────────────────────────────────────────────

async function buildCharts(
  circleIds: string[] | null,
  today: Date,
  db: PrismaClient,
): Promise<ChartPoint[]> {
  // ابدأ من أوّل سجلّ حضور أو جلسة
  const [firstAtt, firstSess] = await Promise.all([
    db.attendance.findFirst({
      where: circleIds ? { circleId: { in: circleIds } } : {},
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    db.dailySession.findFirst({
      where: { ...(circleIds ? { circleId: { in: circleIds } } : {}), hifzMastered: true },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  const firstDate = [firstAtt?.date, firstSess?.date]
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime())[0];

  if (!firstDate) return [];

  const todayMs = makkahDayStart(today).getTime();
  const startMs = Math.max(firstDate.getTime(), todayMs - 56 * 86_400_000); // آخر ٨ أسابيع فقط
  const circleFilter = circleIds ? { circleId: { in: circleIds } } : {};

  const [attAll, sessAll] = await Promise.all([
    db.attendance.findMany({
      where: { ...circleFilter, date: { gte: new Date(startMs) } },
      select: { date: true, status: true },
    }),
    db.dailySession.findMany({
      where: { ...circleFilter, date: { gte: new Date(startMs) }, hifzMastered: true },
      select: { date: true },
    }),
  ]);

  // تجميع أسبوعيّ
  const weekMap = new Map<number, { present: number; total: number; mastered: number; label: string }>();
  const getWeekKey = (d: Date) => {
    const dow = d.getUTCDay();
    const offset = (dow >= 0 && dow <= 4) ? dow : (dow === 5 ? 5 : 6);
    const weekStart = new Date(d.getTime() - offset * 86_400_000);
    return weekStart.getTime();
  };

  for (const a of attAll) {
    const k = getWeekKey(a.date);
    if (!weekMap.has(k)) weekMap.set(k, { present: 0, total: 0, mastered: 0, label: makkahDayDate(new Date(k)).slice(5) });
    const w = weekMap.get(k)!;
    w.total++;
    if (PRESENT_STATUSES.includes(a.status as AttendanceStatus)) w.present++;
  }
  for (const s of sessAll) {
    const k = getWeekKey(s.date);
    if (!weekMap.has(k)) weekMap.set(k, { present: 0, total: 0, mastered: 0, label: makkahDayDate(new Date(k)).slice(5) });
    weekMap.get(k)!.mastered++;
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([ms, v]) => ({
      dateIso: makkahDayDate(new Date(ms)),
      hijriLabel: v.label,
      present: v.present,
      total: v.total,
      mastered: v.mastered,
    }));
}

// ─── قسم المدّكِر ────────────────────────────────────────────────────────────

async function buildMuddakirFollowUp(
  _supervisorId: string | null,
  today: Date,
  db: PrismaClient,
): Promise<MuddakirFollowUp[]> {
  const sevenDaysAgo = new Date(makkahDayStart(today));
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const todayMs = makkahDayStart(today).getTime();
  const dow = new Date(todayMs).getUTCDay();
  const weekStart = new Date(todayMs - dow * 86_400_000);

  const [shortfallDays, unconfirmedWeeks] = await Promise.all([
    db.muddakirDay.findMany({
      where: { status: MuddakirDayStatus.SHORTFALL, dayDate: { gte: sevenDaysAgo } },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.muddakirWeek.findMany({
      where: { weekStart: { gte: weekStart }, regularityConfirmedAt: null },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
  ]);

  const needingFollow = new Map<string, Set<"SHORTFALL" | "UNCONFIRMED">>();
  for (const d of shortfallDays) {
    if (!needingFollow.has(d.studentId)) needingFollow.set(d.studentId, new Set());
    needingFollow.get(d.studentId)!.add("SHORTFALL");
  }
  for (const w of unconfirmedWeeks) {
    if (!needingFollow.has(w.studentId)) needingFollow.set(w.studentId, new Set());
    needingFollow.get(w.studentId)!.add("UNCONFIRMED");
  }

  if (needingFollow.size === 0) return [];

  const hafizIds = Array.from(needingFollow.keys());

  // جلب الأسماء من Student→User (جدول بلا FK)
  const students = await db.student.findMany({
    where: { id: { in: hafizIds } },
    select: { id: true, user: { select: { id: true, nameAsInId: true } } },
  });
  const studentNameMap = new Map(students.map((s) => [s.id, { userId: s.user.id, name: s.user.nameAsInId }]));

  // جلب المشرفين (supervisorId = User.id)
  const supervisions = await db.muddakirSupervision.findMany({
    where: { studentId: { in: hafizIds }, endedAt: null },
    select: { studentId: true, supervisorId: true },
  });
  const supervisorUserIds = [...new Set(supervisions.map((s) => s.supervisorId))];
  const supervisorUsers = supervisorUserIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: supervisorUserIds } },
        select: { id: true, nameAsInId: true },
      })
    : [];
  const supervisorNameMap = new Map(supervisorUsers.map((u) => [u.id, u.nameAsInId]));
  const supervisorByStudent = new Map(supervisions.map((s) => [s.studentId, s.supervisorId]));

  return hafizIds
    .filter((id) => studentNameMap.has(id))
    .map((id) => {
      const info = studentNameMap.get(id)!;
      const supId = supervisorByStudent.get(id);
      return {
        studentId: id,
        userId: info.userId,
        name: info.name,
        supervisorName: supId ? (supervisorNameMap.get(supId) ?? null) : null,
        reasons: Array.from(needingFollow.get(id) ?? []),
      };
    });
}

// ─── الدالّة الرئيسيّة ────────────────────────────────────────────────────────

export async function getDashboardData(
  actorRoles: Role[],
  actorId: string,
  now: Date = new Date(),
  db: PrismaClient = defaultPrisma,
): Promise<DashboardData> {
  const { isAdmin, isTeacher, isDonor } = roleFlags(actorRoles);
  const today = makkahDayStart(now);
  const todayIso = makkahDayDate(now);

  if (isDonor) {
    const circles = await getActiveCircles(null, db);
    const circleIds = circles.map((c) => c.id);
    const charts = await buildCharts(circleIds, today, db);
    return {
      followUp: [],
      todayCircles: [],
      students: [],
      circleComparison: [],
      charts,
      muddakirFollowUp: [],
      donorMode: true,
      todayIso,
    };
  }

  const circleIds = isTeacher ? await getTeacherCircleIds(actorId, db) : null;

  const [circles, students] = await Promise.all([
    getActiveCircles(circleIds, db),
    getActiveStudentsInCircles(circleIds, db),
  ]);

  const [followUp, todayCircles, studentRows, charts, muddakirFollowUp] = await Promise.all([
    buildFollowUp(students, today, db),
    buildTodayCircles(circles, today, db),
    buildStudentsTable(students, today, db),
    buildCharts(circleIds, today, db),
    isAdmin ? buildMuddakirFollowUp(null, today, db) : Promise.resolve<MuddakirFollowUp[]>([]),
  ]);

  const circleComparison = buildCircleComparison(circles, studentRows);

  return {
    followUp,
    todayCircles,
    students: studentRows,
    circleComparison,
    charts,
    muddakirFollowUp,
    donorMode: false,
    todayIso,
  };
}
