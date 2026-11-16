import { AttendanceStatus, AutoEventType, ProgramKey, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { defaultStatusFor, toDateOnly } from "./attendance";
import { getAttendanceDayLock, type DayLock } from "./attendance-lock";
import { assertCanRecordListening, getCircleSessionBoard } from "./daily-session";
import { grantAuto } from "./economy";
import { getQaidahPosition, qaidahBoardRow, type QaidahBoardStudent } from "./qaidah-session";
import { getStudentSetupStatusBatch, type StudentSetupStatus } from "./student-setup";
import { nextUnitForStudent } from "./track-units";
import { todayTarget, type AyahBound, type TodayTarget } from "./today-target";

// ═══════════════ الشاشة الموحّدة (م ج) — لوحةٌ واحدة + الزيادة ═══════════════
//
// getUnifiedBoard يُرجع بيانات القائمة فقط (لا today/qaidah) — سريعٌ ثابتُ الاستعلامات.
// getStudentPanelDetail يُحضِر today + qaidah + الإثراء لطالبٍ واحد عند فتح بطاقته.

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const EXTRA_EVENT: Record<"hifz" | "tarseekh" | "murajaah", AutoEventType> = {
  hifz: AutoEventType.HIFZ_EXTRA,
  tarseekh: AutoEventType.TARSEEKH_EXTRA,
  murajaah: AutoEventType.MURAJAAH_EXTRA,
};

export interface UnifiedStudent {
  studentId: string;
  name: string;
  program: string | null;
  stageLabel: string | null;
  hizb: number | null;
  yesterday: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; mastered: boolean } | null;
  required: { tarseekhCount: number; khums: number } | null;
  weeklyPercent: number | null;
  weeklyComplete: boolean;
  todayHifzDone: boolean;
  tarseekhDone: boolean | null;
  deferredToday: boolean;
  mustRepeat: boolean;
  attendanceStatus: AttendanceStatus | null;
  setupStatus: StudentSetupStatus;
  noTrack: boolean;
}

export interface UnifiedBoard {
  circle: { id: string; nameAr: string } | null;
  program: ProgramKey | null;
  students: UnifiedStudent[];
  absentDefault: boolean;
  dayLock: DayLock;
}

// ─── تفاصيل بطاقة الطالب (محضَرةٌ عند الفتح فقط) ───

/** يُثري حدود الوحدات بـsessionId وأخطاء اليوم — ٢ استعلامان لطالبٍ واحد. */
async function enrichBounds(
  studentId: string,
  units: AyahBound[],
  date: Date,
  db: PrismaClient,
): Promise<AyahBound[]> {
  if (!units.length) return [];
  const sessions = await db.dailySession.findMany({
    where: { studentId, hifzMastered: true, repairedAt: null, hifzFromSurah: { not: null } },
    select: { id: true, hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true },
    orderBy: { date: "desc" },
  });
  const sessionMap = new Map<string, string>();
  for (const s of sessions) {
    if (s.hifzFromSurah != null && s.hifzToSurah != null) {
      const k = `${s.hifzFromSurah}:${s.hifzFromAyah ?? 0}:${s.hifzToSurah}:${s.hifzToAyah ?? 0}`;
      if (!sessionMap.has(k)) sessionMap.set(k, s.id);
    }
  }
  const knownIds = [...new Set(units.map((u) => sessionMap.get(`${u.fromSurah}:${u.fromAyah}:${u.toSurah}:${u.toAyah}`) ?? null).filter((id): id is string => id !== null))];
  const errorCounts = new Map<string, number>();
  if (knownIds.length) {
    const groups = await db.reviewError.groupBy({ by: ["sessionId"], where: { sessionId: { in: knownIds }, date }, _count: { sessionId: true } });
    for (const g of groups) errorCounts.set(g.sessionId, g._count.sessionId);
  }
  return units.map((u) => {
    const sid = sessionMap.get(`${u.fromSurah}:${u.fromAyah}:${u.toSurah}:${u.toAyah}`) ?? null;
    return { ...u, sessionId: sid, savedErrors: sid ? (errorCounts.get(sid) ?? 0) : 0 };
  });
}

export interface StudentPanelDetail {
  today: TodayTarget;
  qaidah: QaidahBoardStudent | null;
}

/** تفاصيل بطاقة طالبٍ واحد — تُحضَر عند فتح البطاقة فقط. */
export async function getStudentPanelDetail(
  _actorId: string,
  studentId: string,
  program: string | null,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<StudentPanelDetail> {
  const reviewDate = toDateOnly(date);
  const [rawToday, qaidahPos] = await Promise.all([
    todayTarget(studentId, date, db),
    program === ProgramKey.QAIDAH_MADANIYYAH ? getQaidahPosition(studentId, db, date) : Promise.resolve(null),
  ]);

  const [enrichedTarseekh, enrichedMurajaah] = await Promise.all([
    enrichBounds(studentId, rawToday.tarseekh, reviewDate, db),
    rawToday.murajaah
      ? enrichBounds(studentId, rawToday.murajaah.todaySlice, reviewDate, db).then((s) => ({ ...rawToday.murajaah!, todaySlice: s }))
      : Promise.resolve(null),
  ]);

  return {
    today: { ...rawToday, tarseekh: enrichedTarseekh, murajaah: enrichedMurajaah },
    qaidah: program === ProgramKey.QAIDAH_MADANIYYAH && qaidahPos ? qaidahBoardRow(studentId, "", qaidahPos) : null,
  };
}

// ─── لوحة القائمة (سريعة، لا today/qaidah) ───

/**
 * لوحة الحلقة الموحّدة — بيانات القائمة فقط (بلا today/qaidah).
 * يعتمد على batch ثابت الاستعلامات بدلاً من حلقة N+1.
 */
export async function getUnifiedBoard(
  actorId: string,
  circleId: string,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<UnifiedBoard> {
  const board = await getCircleSessionBoard(actorId, circleId, date, db);
  const reviewDate = toDateOnly(date);
  const studentIds = board.students.map((s) => s.studentId);

  const [attRows, setupMap, dayLock, trackRows] = await Promise.all([
    db.attendance.findMany({ where: { circleId, date: reviewDate }, select: { studentId: true, status: true } }),
    getStudentSetupStatusBatch(studentIds, db),
    getAttendanceDayLock(circleId, date, db),
    studentIds.length
      ? db.trackAssignment.findMany({ where: { studentId: { in: studentIds }, endedAt: null }, select: { studentId: true } })
      : Promise.resolve([]),
  ]);
  const statusBy = new Map(attRows.map((r) => [r.studentId, r.status]));
  const withTrack = new Set(trackRows.map((r) => r.studentId));

  const students: UnifiedStudent[] = board.students.map((s) => ({
    studentId: s.studentId,
    name: s.name,
    program: s.program,
    stageLabel: s.stageLabel,
    hizb: s.hizb,
    yesterday: s.yesterday,
    required: s.required,
    weeklyPercent: s.weeklyPercent,
    weeklyComplete: s.weeklyComplete,
    todayHifzDone: s.todayHifzDone,
    tarseekhDone: s.tarseekhDone,
    deferredToday: s.deferredToday,
    mustRepeat: s.mustRepeat,
    attendanceStatus: statusBy.get(s.studentId) ?? null,
    setupStatus: setupMap.get(s.studentId) ?? { studentId: s.studentId, isComplete: true, blockers: [], warnings: [] },
    noTrack: s.program === "MARAQI" && !withTrack.has(s.studentId),
  }));

  return {
    circle: board.circle,
    program: null,
    students,
    absentDefault: defaultStatusFor(date) === AttendanceStatus.ABSENT_UNEXCUSED,
    dayLock,
  };
}

export interface ExtraArgs {
  studentId: string; actorId: string; kind: "hifz" | "tarseekh" | "murajaah"; date: string | Date;
}
export interface ExtraResult {
  unit: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null;
}

export async function recordExtra(args: ExtraArgs, db: PrismaClient = prisma): Promise<ExtraResult> {
  await assertCanRecordListening(args.actorId, args.studentId, db);
  const next = await nextUnitForStudent(args.studentId, db);
  if (!next) return { unit: null };
  const dk = dayKey(toDateOnly(args.date));
  const sourceRef = `${dk}:${next.startSurah}:${next.startAyah}`;
  await grantAuto(db, EXTRA_EVENT[args.kind], args.studentId, sourceRef);
  return { unit: { fromSurah: next.startSurah, fromAyah: next.startAyah, toSurah: next.endSurah, toAyah: next.endAyah } };
}
