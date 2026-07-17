import { type Gender, type PrismaClient, type ProgramKey, type TimeSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "./errors";

// إدارة الحلقات الأدنى: المدير يُنشئ الحلقات تحت برنامجٍ قائم (لا يُنشئ البرامج).
// الحلقة كيانٌ عندنا (§٦٫١) — إليها يُسنَد الطالب عند التحديد.

export interface CircleRow {
  id: string;
  nameAr: string;
  timeSlot: TimeSlot;
  gender: Gender;
  location: string | null;
  programKey: ProgramKey;
  programNameAr: string;
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
    programKey: r.program.key,
    programNameAr: r.program.nameAr,
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
  programId: string;
  location?: string | null;
}

export async function createCircle(input: CreateCircleInput, db: PrismaClient = prisma) {
  const nameAr = input.nameAr.trim();
  if (!nameAr) throw new ValidationError("اسم الحلقة مطلوب.");
  const program = await db.program.findUnique({ where: { id: input.programId }, select: { id: true } });
  if (!program) throw new ValidationError("البرنامج غير موجود.");
  return db.circle.create({
    data: {
      nameAr,
      timeSlot: input.timeSlot,
      gender: input.gender,
      programId: input.programId,
      location: input.location?.trim() || null,
    },
    select: { id: true, nameAr: true },
  });
}
