import { MuddakirStaffRole, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface EnrollDataProgram { id: string; key: string; nameAr: string }
export interface EnrollDataTrack { id: string; nameAr: string; linesPerDay: number; ordinal: number }
export interface EnrollDataSupervisor { id: string; nameAr: string; currentLoad: number }

export interface EnrollDataResult {
  programs: EnrollDataProgram[];
  tracks: EnrollDataTrack[];
  supervisors: EnrollDataSupervisor[];
  circleNameAr: string | null;
}

/** يجمع بيانات نموذج التسجيل الكامل (البرامج، المسارات، المشرفون). */
export async function getEnrollFormData(
  circleId: string,
  db: PrismaClient = prisma,
): Promise<EnrollDataResult> {
  const [programs, tracks, supervisorStaff] = await Promise.all([
    db.program.findMany({
      select: { id: true, key: true, nameAr: true },
      orderBy: { nameAr: "asc" },
    }),
    db.track.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, linesPerDay: true, ordinal: true },
      orderBy: { ordinal: "asc" },
    }),
    db.muddakirStaff.findMany({
      where: { role: MuddakirStaffRole.SUPERVISOR, endedAt: null },
      select: { userId: true },
    }),
  ]);

  const supervisorIds = supervisorStaff.map((s) => s.userId);
  const [supervisorUsers, loads] = await Promise.all([
    supervisorIds.length
      ? db.user.findMany({
          where: { id: { in: supervisorIds } },
          select: { id: true, nameAsInId: true },
        })
      : Promise.resolve([]),
    supervisorIds.length
      ? db.muddakirSupervision.groupBy({
          by: ["supervisorId"],
          where: { supervisorId: { in: supervisorIds }, endedAt: null },
          _count: { studentId: true },
        })
      : Promise.resolve([]),
  ]);

  const userNameMap = new Map(supervisorUsers.map((u) => [u.id, u.nameAsInId]));
  const loadMap = new Map(loads.map((l) => [l.supervisorId, l._count.studentId]));

  let circleNameAr: string | null = null;
  if (circleId) {
    const circle = await db.circle.findUnique({
      where: { id: circleId },
      select: { nameAr: true },
    });
    circleNameAr = circle?.nameAr ?? null;
  }

  return {
    programs,
    tracks,
    supervisors: supervisorStaff.map((s) => ({
      id: s.userId,
      nameAr: userNameMap.get(s.userId) ?? s.userId,
      currentLoad: loadMap.get(s.userId) ?? 0,
    })),
    circleNameAr,
  };
}
