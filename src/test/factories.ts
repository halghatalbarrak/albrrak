import {
  Gender,
  type PrismaClient,
  ProgramKey,
  Role,
  TimeSlot,
} from "@prisma/client";

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

export async function createUser(
  db: PrismaClient,
  opts: { roles?: Role[]; nationalId?: string; email?: string | null } = {},
) {
  return db.user.create({
    data: {
      nameAsInId: `مستخدم-${uniq()}`,
      gender: Gender.MALE,
      roles: opts.roles ?? [],
      nationalId: opts.nationalId ?? null,
      email: opts.email ?? null,
    },
  });
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
