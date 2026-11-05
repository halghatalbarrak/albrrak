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
  /** عدد الطلاب النشطين لكلّ برنامج في الحلقة (عدّاد الترويسة: «مراقي ٢٠ · القاعدة ٩»). */
  programCounts: { programKey: ProgramKey; n: number }[];
}

export async function listCircles(db: PrismaClient = prisma): Promise<CircleRow[]> {
  const [rows, grouped, programs] = await Promise.all([
    db.circle.findMany({
      select: { id: true, nameAr: true, timeSlot: true, gender: true, location: true, program: { select: { key: true, nameAr: true } } },
      orderBy: { nameAr: "asc" },
    }),
    db.enrollment.groupBy({ by: ["circleId", "programId"], where: { endedAt: null }, _count: { _all: true } }),
    db.program.findMany({ select: { id: true, key: true } }),
  ]);
  const keyById = new Map(programs.map((p) => [p.id, p.key]));
  const countsByCircle = new Map<string, { programKey: ProgramKey; n: number }[]>();
  for (const g of grouped) {
    const key = g.programId ? keyById.get(g.programId) : undefined;
    if (!key) continue; // قيدٌ بلا برنامجٍ معروف — يُتجاوَز في العدّاد
    const list = countsByCircle.get(g.circleId) ?? [];
    list.push({ programKey: key, n: g._count._all });
    countsByCircle.set(g.circleId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    nameAr: r.nameAr,
    timeSlot: r.timeSlot,
    gender: r.gender,
    location: r.location,
    programKey: r.program?.key ?? null,
    programNameAr: r.program?.nameAr ?? null,
    programCounts: countsByCircle.get(r.id) ?? [],
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
