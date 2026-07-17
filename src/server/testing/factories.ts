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
