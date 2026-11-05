import { type Gender, type PrismaClient, type ProgramKey, type TimeSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verr } from "./errors";

// إدارة الحلقات الأدنى: المدير يُنشئ الحلقات تحت برنامجٍ قائم (لا يُنشئ البرامج).
// الحلقة كيانٌ عندنا (§٦٫١) — إليها يُسنَد الطالب عند التحديد.

export interface CircleRow {
  id: string;
  nameAr: string;
  timeSlot: TimeSlot;
  gender: Gender;
  location: string | null;
  // الحلقة قد لا تتبع برنامجاً (قد تكون مختلطة) — البرنامج صفةٌ في قيد الطالب.
  programKey: ProgramKey | null;
  programNameAr: string | null;
}

export async function listCircles(db: PrismaClient = prisma): Promise<CircleRow[]> {
  const rows = await db.circle.findMany({
    select: {
      id: true,
      nameAr: true,
      timeSlot: true,
      gender: true,
      location: true,
      program: { select: { key: true, nameAr: true } },
    },
    orderBy: { nameAr: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    nameAr: r.nameAr,
    timeSlot: r.timeSlot,
    gender: r.gender,
    location: r.location,
    programKey: r.program?.key ?? null,
    programNameAr: r.program?.nameAr ?? null,
  }));
}

export interface ProgramRow {
  id: string;
  key: ProgramKey;
  nameAr: string;
}

export async function listPrograms(db: PrismaClient = prisma): Promise<ProgramRow[]> {
  return db.program.findMany({ select: { id: true, key: true, nameAr: true }, orderBy: { nameAr: "asc" } });
}

export interface CreateCircleInput {
  nameAr: string;
  timeSlot: TimeSlot;
  gender: Gender;
  /** البرنامج اختياريّ ومهجور (قرار المدير): الحلقة لا تتبع برنامجاً. */
  programId?: string | null;
  location?: string | null;
}

export async function createCircle(input: CreateCircleInput, db: PrismaClient = prisma) {
  const nameAr = input.nameAr.trim();
  if (!nameAr) throw verr("circleNameRequired");
  if (input.programId) {
    const program = await db.program.findUnique({ where: { id: input.programId }, select: { id: true } });
    if (!program) throw verr("programNotFound");
  }
  return db.circle.create({
    data: {
      nameAr,
      timeSlot: input.timeSlot,
      gender: input.gender,
      programId: input.programId ?? null,
      location: input.location?.trim() || null,
    },
    select: { id: true, nameAr: true },
  });
}
