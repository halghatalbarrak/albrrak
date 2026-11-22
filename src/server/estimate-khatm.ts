/**
 * estimateKhatmDate — تقدير تاريخ الختمة لطالب مراقيّ.
 *
 * الخوارزمية:
 *   ١. المسار الحاليّ: الوحدات المتبقّية بعد الجبهة (أبعد موضعٍ حفظه).
 *   ٢. المسارات الأعلى: كل وحداتها.
 *   ٣. معامل الانتظام: نسبة الحضور آخر ٨ أسابيع.
 *   ٤. الختمة = اليوم + الوحدات المتبقّية × (٧ ÷ (٥ × الانتظام)).
 *
 * شرط البيانات: ≥ ١٠ جلسات في آخر ٥٦ يومًا، وإلّا → INSUFFICIENT_DATA.
 * المسار المرفوع محترَمٌ: نبدأ من الحالي، لا من أوّل السلّم.
 */
import { AttendanceStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { maraqiKey } from "@/lib/maraqi-order";

export type KhatmResult =
  | { kind: "DATE"; date: Date; remainingUnits: number; regularityPct: number }
  | { kind: "INSUFFICIENT_DATA" }
  | { kind: "NO_TRACK" }
  | { kind: "COMPLETE" };

const PRESENT_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.LEFT_EARLY,
];

const STUDY_DAYS_PER_WEEK = 5;
const MIN_SESSIONS_THRESHOLD = 10; // ٢ أسبوع × ٥ أيام

/** أبعد موضعٍ حفظه الطالب بترتيب مراقي، أو null. */
async function getFrontierKey(studentId: string, db: PrismaClient): Promise<number | null> {
  const sessions = await db.dailySession.findMany({
    where: { studentId, hifzToSurah: { not: null } },
    select: { hifzToSurah: true, hifzToAyah: true },
  });
  let best: number | null = null;
  for (const s of sessions) {
    if (s.hifzToSurah == null) continue;
    const k = maraqiKey(s.hifzToSurah, s.hifzToAyah ?? 1);
    if (best === null || k > best) best = k;
  }
  return best;
}

/** مفتاح مراقي لآخر وحدةٍ في أعلى مسار = نهاية الختمة (البقرة:٢٨٦). */
async function getKhatmEndKey(programId: string, db: PrismaClient): Promise<number | null> {
  const topTrack = await db.track.findFirst({
    where: { programId, isActive: true },
    orderBy: { ordinal: "desc" },
    select: { id: true },
  });
  if (!topTrack) return null;
  const lastUnit = await db.trackUnit.findFirst({
    where: { trackId: topTrack.id },
    orderBy: { unitNo: "desc" },
    select: { endSurah: true, endAyah: true },
  });
  return lastUnit ? maraqiKey(lastUnit.endSurah, lastUnit.endAyah) : null;
}

/** IDOR: يتحقّق أنّ ولي الأمر مرتبطٌ بالطالب — يستعمله كلٌّ من الختمة وملخّص الابن. */
export async function assertGuardianOwnsStudent(
  guardianId: string,
  studentId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const link = await db.guardianLink.findFirst({
    where: { guardianId, studentId, status: { not: "UNLINKED" } },
    select: { id: true },
  });
  if (!link) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
}

export async function estimateKhatmDate(
  studentId: string,
  now: Date = new Date(),
  db: PrismaClient = prisma,
): Promise<KhatmResult> {
  // ١. المسار الحاليّ
  const assignment = await db.trackAssignment.findFirst({
    where: { studentId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { trackId: true },
  });
  if (!assignment) return { kind: "NO_TRACK" };

  const currentTrack = await db.track.findUnique({
    where: { id: assignment.trackId },
    select: { id: true, ordinal: true, linesPerDay: true, programId: true, isActive: true },
  });
  if (!currentTrack) return { kind: "NO_TRACK" };

  // ٢. الجبهة الحاليّة
  const frontierKey = await getFrontierKey(studentId, db);

  // هل أتمّ الختمة؟ إن كانت الجبهة أبعد من نهاية آخر مسار
  const khatmEndKey = await getKhatmEndKey(currentTrack.programId, db);
  if (khatmEndKey !== null && frontierKey !== null && frontierKey >= khatmEndKey) {
    return { kind: "COMPLETE" };
  }

  // ٣. المسارات من الحاليّ فصاعدًا (محترِمةً المسار المرفوع)
  const allTracks = await db.track.findMany({
    where: { programId: currentTrack.programId, isActive: true, ordinal: { gte: currentTrack.ordinal } },
    orderBy: { ordinal: "asc" },
    select: { id: true, ordinal: true },
  });

  let remainingUnits = 0;
  for (const track of allTracks) {
    const units = await db.trackUnit.findMany({
      where: { trackId: track.id },
      orderBy: { unitNo: "asc" },
      select: { unitNo: true, startSurah: true, startAyah: true },
    });
    if (track.id === currentTrack.id) {
      // في المسار الحاليّ: فقط الوحدات بعد الجبهة
      for (const u of units) {
        const unitKey = maraqiKey(u.startSurah, u.startAyah);
        if (frontierKey === null || unitKey > frontierKey) remainingUnits++;
      }
    } else {
      // مسارات أعلى: كل وحداتها
      remainingUnits += units.length;
    }
  }

  if (remainingUnits === 0) return { kind: "COMPLETE" };

  // ٤. انتظام الحضور آخر ٨ أسابيع (٥٦ يومًا)
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const attRows = await db.attendance.findMany({
    where: { studentId, date: { gte: eightWeeksAgo, lte: now } },
    select: { status: true },
  });

  const totalSessions = attRows.length;
  if (totalSessions < MIN_SESSIONS_THRESHOLD) {
    return { kind: "INSUFFICIENT_DATA" };
  }

  const presentCount = attRows.filter((a) => PRESENT_STATUSES.includes(a.status)).length;
  const regularity = presentCount / totalSessions;

  if (regularity <= 0) return { kind: "INSUFFICIENT_DATA" };

  // ٥. الحساب
  // كل وحدة = يومٌ دراسيّ واحد. تُحوَّل إلى أيام تقويميّة.
  const calendarDaysPerUnit = 7 / (STUDY_DAYS_PER_WEEK * regularity);
  const calendarDaysRemaining = Math.ceil(remainingUnits * calendarDaysPerUnit);

  const khatmDate = new Date(now);
  khatmDate.setDate(khatmDate.getDate() + calendarDaysRemaining);

  return {
    kind: "DATE",
    date: khatmDate,
    remainingUnits,
    regularityPct: Math.round(regularity * 100),
  };
}
