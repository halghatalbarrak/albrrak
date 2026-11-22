import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { makkahDayDate, makkahDayStart } from "@/lib/makkah-day";
import { getBalance } from "./economy";
import { roadmapsForStudent } from "./gamification/roadmap";

// صفحة وليّ الأمر: أبناؤه المرتبطون، حضورهم في اليوم المحدّد، ما سُمِّعوا، نقاطهم، الخطوة القادمة.

export interface ChildAttendance {
  status: "PRESENT" | "LATE" | "LEFT_EARLY" | "EXCUSED" | "ABSENT" | null;
}

export interface ChildSession {
  hifzFromSurah: number | null;
  hifzFromAyah: number | null;
  hifzToSurah: number | null;
  hifzToAyah: number | null;
  tarseekhDone: boolean | null;
  murajaahDone: boolean | null;
}

export interface ChildData {
  studentId: string;
  name: string;
  programName: string | null;
  attendance: ChildAttendance;
  session: ChildSession | null;
  points: number;
  nextStationLabel: string | null;
}

/**
 * date: "YYYY-MM-DD" بتوقيت مكّة (اختياريّ — يُفترض اليوم الحاليّ إن لم يُحدَّد).
 * يُعيد فقط أبناء هذا الوليّ — IDOR محمي بالاستعلام نفسه (guardianId = guardianUserId).
 */
export async function getGuardianChildrenData(
  guardianUserId: string,
  date?: string,
  db: PrismaClient = prisma,
): Promise<ChildData[]> {
  const links = await db.guardianLink.findMany({
    where: {
      guardianId: guardianUserId,
      status: { not: "UNLINKED" },
    },
    select: { studentId: true },
  });

  if (links.length === 0) return [];

  const studentIds = links.map((l) => l.studentId);

  const ref = date ? new Date(`${date}T12:00:00+03:00`) : new Date();
  const dayStart = makkahDayStart(ref);

  const [students, attendances, sessions] = await Promise.all([
    db.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: {
        id: true,
        user: { select: { nameAsInId: true } },
        enrollments: {
          where: { endedAt: null },
          select: { program: { select: { nameAr: true } } },
          take: 1,
        },
      },
    }),
    db.attendance.findMany({
      where: { studentId: { in: studentIds }, date: dayStart },
      select: { studentId: true, status: true },
    }),
    db.dailySession.findMany({
      where: { studentId: { in: studentIds }, date: dayStart },
      select: {
        studentId: true,
        hifzFromSurah: true, hifzFromAyah: true,
        hifzToSurah: true, hifzToAyah: true,
        tarseekhDone: true, murajaahDone: true,
      },
    }),
  ]);

  const attendanceByStudent = new Map(attendances.map((a) => [a.studentId, a.status]));
  const sessionByStudent = new Map(sessions.map((s) => [s.studentId, s]));

  const results: ChildData[] = [];
  for (const student of students) {
    const [points, roadmaps] = await Promise.all([
      getBalance(student.id, db),
      roadmapsForStudent(student.id, db).catch(() => []),
    ]);

    const currentStation = roadmaps.flatMap((r) =>
      r.stations.filter((s) => s.state === "CURRENT").map((s) => s.label),
    )[0] ?? null;

    const sess = sessionByStudent.get(student.id) ?? null;
    const attendStatus = attendanceByStudent.get(student.id) ?? null;

    results.push({
      studentId: student.id,
      name: student.user.nameAsInId,
      programName: student.enrollments[0]?.program?.nameAr ?? null,
      attendance: { status: attendStatus as ChildAttendance["status"] },
      session: sess
        ? {
            hifzFromSurah: sess.hifzFromSurah,
            hifzFromAyah: sess.hifzFromAyah,
            hifzToSurah: sess.hifzToSurah,
            hifzToAyah: sess.hifzToAyah,
            tarseekhDone: sess.tarseekhDone,
            murajaahDone: sess.murajaahDone,
          }
        : null,
      points,
      nextStationLabel: currentStation,
    });
  }

  return results;
}

/** اليوم الحاليّ بتوقيت مكّة (YYYY-MM-DD). */
export function guardianToday(): string {
  return makkahDayDate(new Date());
}
