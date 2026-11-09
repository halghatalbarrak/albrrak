import { Role, type Gender, type PrismaClient, type ProgramKey, type TimeSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aerr, verr } from "./errors";

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
      where: { deletedAt: null },
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
  teacherId?: string | null;
}

/** ينزّه النصّ لمقارنة أسماء الحلقات: يُزيل التشكيل والتطويل ويوحّد همزات الألف. */
export function normalizeCircleName(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, "")  // تشكيل
    .replace(/ـ/g, "")                       // تطويل
    .replace(/[أإآٱ]/g, "ا")                // همزات الألف
    .trim();
}

export async function createCircle(input: CreateCircleInput, db: PrismaClient = prisma) {
  const nameAr = input.nameAr.trim();
  if (!nameAr) throw verr("circleNameRequired");

  // تحقّق من تكرار الاسم (بعد تنزيه التشكيل والهمزات).
  const normalizedInput = normalizeCircleName(nameAr);
  const allCircles = await db.circle.findMany({ select: { nameAr: true, deletedAt: true } });
  const dupActive = allCircles.find((c) => c.deletedAt === null && normalizeCircleName(c.nameAr) === normalizedInput);
  if (dupActive) throw verr("circleNameDuplicate");
  const dupDeleted = allCircles.find((c) => c.deletedAt !== null && normalizeCircleName(c.nameAr) === normalizedInput);
  if (dupDeleted) throw verr("circleNameInTrash");

  if (input.programId) {
    const program = await db.program.findUnique({ where: { id: input.programId }, select: { id: true } });
    if (!program) throw verr("programNotFound");
  }
  if (input.teacherId) {
    const teacher = await db.user.findUnique({ where: { id: input.teacherId }, select: { roles: true } });
    if (!teacher || !teacher.roles.includes(Role.TEACHER)) throw verr("teacherNotFound");
  }
  const circleData = {
    nameAr,
    timeSlot: input.timeSlot,
    gender: input.gender,
    programId: input.programId ?? null,
    location: input.location?.trim() || null,
  };
  if (!input.teacherId) {
    return db.circle.create({ data: circleData, select: { id: true, nameAr: true } });
  }
  const teacherId = input.teacherId;
  return db.$transaction(async (tx) => {
    const circle = await tx.circle.create({ data: circleData, select: { id: true, nameAr: true } });
    await tx.circleTeacher.create({ data: { circleId: circle.id, teacherId } });
    return circle;
  });
}

export interface TeacherRow {
  id: string;
  name: string;
}

export async function listTeachers(db: PrismaClient = prisma): Promise<TeacherRow[]> {
  const rows = await db.user.findMany({
    where: { roles: { has: Role.TEACHER }, isActive: true },
    select: { id: true, nameAsInId: true },
    orderBy: { nameAsInId: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.nameAsInId }));
}

/** يحذف الحلقة ناعماً (deletedAt). يرمي إن كانت محذوفةً أو فيها طلابٌ نشطون. */
export async function softDeleteCircle(actorId: string, circleId: string, db: PrismaClient = prisma): Promise<void> {
  const circle = await db.circle.findUnique({ where: { id: circleId }, select: { id: true, nameAr: true, deletedAt: true } });
  if (!circle) throw verr("circleNotFound");
  if (circle.deletedAt) throw verr("circleAlreadyDeleted");
  const activeCount = await db.enrollment.count({ where: { circleId, endedAt: null } });
  if (activeCount > 0) throw verr("circleHasActiveStudents");
  const now = new Date();
  await db.$transaction([
    db.circle.update({ where: { id: circleId }, data: { deletedAt: now, deletedById: actorId } }),
    db.auditLog.create({ data: { action: "DELETE", entity: "Circle", entityId: circleId, actorId, label: circle.nameAr } }),
  ]);
}

export interface CircleEditData {
  id: string;
  nameAr: string;
  timeSlot: TimeSlot;
  gender: Gender;
  location: string | null;
  teacherId: string | null;
  teacherName: string | null;
}

/** يُرجع بيانات الحلقة لنموذج التعديل (الاسم، الوقت، الجنس، المعلّم الحاليّ). */
export async function getCircleForEdit(circleId: string, db: PrismaClient = prisma): Promise<CircleEditData> {
  const circle = await db.circle.findUnique({
    where: { id: circleId, deletedAt: null },
    select: { id: true, nameAr: true, timeSlot: true, gender: true, location: true },
  });
  if (!circle) throw verr("circleNotFound");
  const link = await db.circleTeacher.findFirst({
    where: { circleId, endedAt: null },
    select: { teacherId: true, teacher: { select: { nameAsInId: true } } },
  });
  return {
    id: circle.id,
    nameAr: circle.nameAr,
    timeSlot: circle.timeSlot,
    gender: circle.gender,
    location: circle.location,
    teacherId: link?.teacherId ?? null,
    teacherName: link?.teacher.nameAsInId ?? null,
  };
}

export interface UpdateCircleInput {
  nameAr: string;
  timeSlot: TimeSlot;
  gender: Gender;
  location?: string | null;
  teacherId?: string | null;
}

/** يُحدِّث الحلقة. يرمي إن تعارض الجنس مع طلابٍ نشطين، أو اسمٌ مكرَّر. */
export async function updateCircle(
  actorId: string,
  circleId: string,
  input: UpdateCircleInput,
  db: PrismaClient = prisma,
): Promise<void> {
  const nameAr = input.nameAr.trim();
  if (!nameAr) throw verr("circleNameRequired");

  const circle = await db.circle.findUnique({ where: { id: circleId, deletedAt: null }, select: { id: true, nameAr: true, timeSlot: true, gender: true, location: true } });
  if (!circle) throw verr("circleNotFound");

  // تحقّق من تكرار الاسم (بعد تنزيه التشكيل والهمزات، بلا هذه الحلقة)
  const normalizedInput = normalizeCircleName(nameAr);
  const others = await db.circle.findMany({ where: { deletedAt: null, id: { not: circleId } }, select: { nameAr: true } });
  if (others.some((c) => normalizeCircleName(c.nameAr) === normalizedInput)) throw verr("circleNameDuplicate");

  // تحقّق من تعارض الجنس مع الطلاب النشطين
  if (input.gender !== circle.gender) {
    const conflictCount = await db.enrollment.count({
      where: { circleId, endedAt: null, student: { user: { gender: { not: input.gender } } } },
    });
    if (conflictCount > 0) throw verr("circleGenderConflict");
  }

  if (input.teacherId) {
    const teacher = await db.user.findUnique({ where: { id: input.teacherId }, select: { roles: true, isActive: true } });
    if (!teacher || !teacher.roles.includes(Role.TEACHER) || !teacher.isActive) throw verr("teacherNotFound");
  }

  const before = JSON.stringify({ nameAr: circle.nameAr, timeSlot: circle.timeSlot, gender: circle.gender, location: circle.location });
  const after = JSON.stringify({ nameAr, timeSlot: input.timeSlot, gender: input.gender, location: input.location ?? null });

  const currentTeacher = await db.circleTeacher.findFirst({ where: { circleId, endedAt: null }, select: { teacherId: true } });
  const newTeacherId = input.teacherId ?? null;
  const teacherChanged = (currentTeacher?.teacherId ?? null) !== newTeacherId;

  await db.$transaction(async (tx) => {
    await tx.circle.update({
      where: { id: circleId },
      data: { nameAr, timeSlot: input.timeSlot, gender: input.gender, location: input.location ?? null },
    });
    if (teacherChanged) {
      if (currentTeacher) {
        await tx.circleTeacher.updateMany({
          where: { circleId, teacherId: currentTeacher.teacherId, endedAt: null },
          data: { endedAt: new Date() },
        });
      }
      if (newTeacherId) {
        await tx.circleTeacher.upsert({
          where: { circleId_teacherId: { circleId, teacherId: newTeacherId } },
          update: { startedAt: new Date(), endedAt: null },
          create: { circleId, teacherId: newTeacherId },
        });
      }
    }
    await tx.auditLog.create({
      data: { action: "UPDATE", entity: "Circle", entityId: circleId, actorId, label: `${before} → ${after}` },
    });
  });
}

/** يرمي AuthorizationError إن لم يكن المعلّم مرتبطاً بالحلقة (endedAt = null). */
export async function assertTeacherOwnsCircle(teacherId: string, circleId: string, db: PrismaClient = prisma): Promise<void> {
  const link = await db.circleTeacher.findFirst({
    where: { circleId, teacherId, endedAt: null },
    select: { circleId: true },
  });
  if (!link) throw aerr("teacherCircleForbidden");
}
