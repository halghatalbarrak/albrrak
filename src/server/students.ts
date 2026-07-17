import { type PrismaClient, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeAge } from "./age-policy";
import { readNationalId } from "./national-id";
import { AuthorizationError } from "./errors";

// عرضٌ آمن للطلاب — **بلا رقم الهوية** (م٥: لا يظهر في تقرير) و**بلا جوال الطوارئ**.
// من يحتاج الرقم الصريح يمرّ عبر readNationalId (مخوّل + مُسجَّل).
export interface StudentListItem {
  id: string;
  state: string;
  name: string;
  gender: string;
}

export async function listStudentsSafe(
  db: PrismaClient = prisma,
): Promise<StudentListItem[]> {
  const rows = await db.student.findMany({
    select: {
      id: true,
      state: true,
      user: { select: { nameAsInId: true, gender: true } },
    },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    name: r.user.nameAsInId,
    gender: r.user.gender,
  }));
}

// عرض المدير: كل سطر يحمل خبره — الاسم، العمر (محسوب لا مخزَّن)، الحالة،
// الحلقة (الانتساب النشط)، والولي. **بلا رقم هوية وبلا جوال طوارئ** (م٥ ونمطه).
export interface AdminStudentRow {
  id: string;
  name: string;
  age: number | null;
  state: string;
  circle: string | null;
  guardian: string | null;
}

export async function listStudentsForAdmin(
  db: PrismaClient = prisma,
  asOf: Date = new Date(),
): Promise<AdminStudentRow[]> {
  const rows = await db.student.findMany({
    select: {
      id: true,
      state: true,
      user: { select: { nameAsInId: true, birthDate: true } },
      enrollments: {
        where: { endedAt: null },
        select: { circle: { select: { nameAr: true } } },
        take: 1,
      },
      guardians: {
        where: { status: "ACTIVE" },
        select: { guardian: { select: { nameAsInId: true, phone: true } } },
        take: 1,
      },
    },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => {
    const g = r.guardians[0]?.guardian;
    return {
      id: r.id,
      name: r.user.nameAsInId,
      age: r.user.birthDate ? computeAge(r.user.birthDate, asOf) : null,
      state: r.state,
      circle: r.enrollments[0]?.circle.nameAr ?? null,
      guardian: g ? (g.phone ? `${g.nameAsInId} (${g.phone})` : g.nameAsInId) : null,
    };
  });
}

/**
 * كشف رقم هوية طالبٍ مقبول — للكادر المخوّل (م٥)، بطلبٍ صريح، وبسطرٍ في سجل الاطّلاع.
 * يمرّ عبر readNationalId (يتحقّق من الدور ويكتب السطر). غير المخوّل ⟵ 403.
 */
export async function revealStudentNationalId(
  args: { studentId: string; viewerId: string; viewerRoles: Role[] },
  db: PrismaClient = prisma,
): Promise<string> {
  const student = await db.student.findUnique({
    where: { id: args.studentId },
    select: { userId: true },
  });
  if (!student) throw new AuthorizationError("طالب غير موجود.");
  return readNationalId(
    {
      viewerId: args.viewerId,
      viewerRoles: args.viewerRoles,
      subjectUserId: student.userId,
      reason: "كشف رقم هوية طالب مقبول",
    },
    db,
  );
}
