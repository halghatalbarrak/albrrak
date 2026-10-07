import { readFileSync } from "node:fs";
import path from "node:path";

import {
  Gender,
  type PrismaClient,
  ProgramKey,
  Role,
  TimeSlot,
} from "@prisma/client";
import { type ApplicationInput } from "../application";

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

/** يبذر خريطة أوجه مصحف المدينة (٦٠٤) من mushaf_faces.json — يمسحها resetDb، فيُعاد بذرها. */
export async function seedMushafFaces(db: PrismaClient) {
  const faces = JSON.parse(
    readFileSync(path.join(process.cwd(), "mushaf_faces.json"), "utf8"),
  ) as { page: number; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }[];
  await db.mushafFace.createMany({ data: faces });
}

/** يبذر حدود الأحزاب الستّين من hizb_boundaries.json (لاشتقاق مراحل المُدَّكِر) — يمسحها resetDb. */
export async function seedHizbBoundaries(db: PrismaClient) {
  const rows = JSON.parse(
    readFileSync(path.join(process.cwd(), "hizb_boundaries.json"), "utf8"),
  ) as { hizb: number; juz: number; startSurahNum: number; startSurah: string; startAyah: number; endSurahNum: number; endSurah: string; endAyah: number }[];
  await db.hizbBoundary.createMany({ data: rows });
}

export async function createUser(
  db: PrismaClient,
  opts: {
    roles?: Role[];
    nationalId?: string;
    email?: string | null;
    authId?: string | null;
    isActive?: boolean;
  } = {},
) {
  return db.user.create({
    data: {
      nameAsInId: `مستخدم-${uniq()}`,
      gender: Gender.MALE,
      roles: opts.roles ?? [],
      nationalId: opts.nationalId ?? null,
      email: opts.email ?? null,
      authId: opts.authId ?? null,
      isActive: opts.isActive ?? true,
    },
  });
}

export async function createNationality(db: PrismaClient) {
  return db.nationality.create({ data: { nameAr: `جنسية-${uniq()}` } });
}

export async function createGuardianRelation(db: PrismaClient) {
  return db.guardianRelation.create({ data: { nameAr: `صفة-${uniq()}`, ordinal: 0 } });
}

/**
 * يبني جسم طلب قيد كامل الحقول الإلزامية (جنسية + صفة قرابة + جهة طوارئ حقيقية)،
 * فلا تكرّر الاختبارات هذه الحقول. الجوالات مختلفة عمدًا (شرط التحقّق).
 */
export async function buildApplicationInput(
  db: PrismaClient,
  overrides: Partial<ApplicationInput> = {},
): Promise<ApplicationInput> {
  const nat = await createNationality(db);
  const rel = await createGuardianRelation(db);
  return {
    nameAsInId: "خالد بن عبدالله",
    nationalId: "1012345678",
    nationalityId: nat.id,
    birthDate: new Date("2010-01-01"),
    gender: Gender.MALE,
    guardianPhone: "0555000001",
    guardianGender: Gender.MALE,
    guardianRelationId: rel.id,
    studentPhone: "0555000002",
    emergencyName: "جهة الطوارئ",
    emergencyPhone: "0555000009",
    emergencyRelationId: rel.id,
    ...overrides,
  };
}

export async function createProgram(db: PrismaClient, key: ProgramKey = ProgramKey.MARAQI) {
  return db.program.create({
    data: { key, nameAr: `برنامج-${uniq()}` },
  });
}

export async function createCircle(db: PrismaClient, programId: string) {
  return db.circle.create({
    data: {
      nameAr: `حلقة-${uniq()}`,
      timeSlot: TimeSlot.MAGHRIB,
      gender: Gender.MALE,
      programId,
    },
  });
}

/** ينشئ User للطالب ثم Student مربوطًا به. */
export async function createStudent(db: PrismaClient) {
  const user = await createUser(db, { roles: [Role.STUDENT] });
  const student = await db.student.create({ data: { userId: user.id } });
  return { user, student };
}

export interface SeedUnit { unitNo: number; startSurah: number; startAyah: number; endSurah: number; endAyah: number }

/**
 * يُنشئ مسار مراقي بوحداته ويُسنده لطالب (لاختبارات الترسيخ/المراجعة الوحدويّة، مراقي ٢).
 * يضمن برنامج مراقي، ويضبط مقادير المنهج لكلّ مسار. يعيد المسار.
 */
export async function seedMaraqiTrackForStudent(
  db: PrismaClient,
  studentId: string,
  opts: { units: SeedUnit[]; linesPerDay?: number; tarseekhUnits?: number; reviewDaysPerWeek?: number },
) {
  let program = await db.program.findUnique({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
  if (!program) program = await db.program.create({ data: { key: ProgramKey.MARAQI, nameAr: `مراقي-${uniq()}` }, select: { id: true } });
  const count = await db.track.count({ where: { programId: program.id } });
  const track = await db.track.create({
    data: {
      programId: program.id, nameAr: `مسار-${uniq()}`, linesPerDay: opts.linesPerDay ?? 5, ordinal: count + 1,
      tarseekhUnits: opts.tarseekhUnits ?? 10, reviewDaysPerWeek: opts.reviewDaysPerWeek ?? 5,
    },
  });
  if (opts.units.length) await db.trackUnit.createMany({ data: opts.units.map((u) => ({ trackId: track.id, ...u })) });
  await db.trackAssignment.create({ data: { studentId, trackId: track.id, reason: "PACE_TEST" } });
  return track;
}
