import { type PrismaClient, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeAge } from "./age-policy";
import { readNationalId } from "./national-id";
import { aerr, verr } from "./errors";

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
    where: { deletedAt: null },
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
  gender: string;
  circle: string | null;
  guardian: string | null;
  /** قرار تحديدٍ معلّقٌ لهذا الطالب (بانتظار اعتماد المدير)، أو null. */
  pendingPlacementId: string | null;
  /** معرِّف الانتساب النشط (لإجراءات النقل/التعليق/الفصل). */
  enrollmentId: string | null;
  /** هل الطالب معلَّق؟ (تاريخ التعليق). */
  suspendedAt: Date | null;
}

export async function listStudentsForAdmin(
  db: PrismaClient = prisma,
  asOf: Date = new Date(),
): Promise<AdminStudentRow[]> {
  const [rows, pendings] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        state: true,
        user: { select: { nameAsInId: true, birthDate: true, gender: true } },
        enrollments: {
          where: { endedAt: null },
          select: { id: true, suspendedAt: true, circle: { select: { nameAr: true } } },
          take: 1,
        },
        guardians: {
          where: { status: "ACTIVE" },
          select: { guardian: { select: { nameAsInId: true, phone: true } } },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
      take: 2000,
    }),
    // قرارات التحديد المعلّقة — subjectId نصّيّ لا علاقة، فنستعلمها منفصلةً ونربطها.
    db.approval.findMany({
      where: {
        kind: "PLACEMENT_DECISION",
        subjectType: "Student",
        status: "PENDING",
      },
      select: { id: true, subjectId: true },
    }),
  ]);
  const pendingByStudent = new Map(pendings.map((a) => [a.subjectId, a.id]));
  return rows.map((r) => {
    const g = r.guardians[0]?.guardian;
    const activeEnrollment = r.enrollments[0];
    return {
      id: r.id,
      name: r.user.nameAsInId,
      age: r.user.birthDate ? computeAge(r.user.birthDate, asOf) : null,
      state: r.state,
      gender: r.user.gender,
      circle: activeEnrollment?.circle?.nameAr ?? null,
      guardian: g ? (g.phone ? `${g.nameAsInId} (${g.phone})` : g.nameAsInId) : null,
      pendingPlacementId: pendingByStudent.get(r.id) ?? null,
      enrollmentId: activeEnrollment?.id ?? null,
      suspendedAt: activeEnrollment?.suspendedAt ?? null,
    };
  });
}

/** يحذف الطالب ناعماً (deletedAt). يرمي إن كان محذوفاً أو لديه انتساب نشط. */
export async function softDeleteStudent(actorId: string, studentId: string, db: PrismaClient = prisma): Promise<void> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, deletedAt: true, user: { select: { nameAsInId: true } } },
  });
  if (!student) throw verr("studentNotFound");
  if (student.deletedAt) throw verr("studentAlreadyDeleted");
  const activeCount = await db.enrollment.count({ where: { studentId, endedAt: null } });
  if (activeCount > 0) throw verr("studentHasActiveEnrollment");
  const now = new Date();
  await db.$transaction([
    db.student.update({ where: { id: studentId }, data: { deletedAt: now, deletedById: actorId } }),
    db.auditLog.create({ data: { action: "DELETE", entity: "Student", entityId: studentId, actorId, label: student.user.nameAsInId } }),
  ]);
}

export interface StudentEditData {
  id: string;
  name: string;
  schoolStage: string | null;
  priorHifzAmount: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelationId: string | null;
}

export async function getStudentForEdit(studentId: string, db: PrismaClient = prisma): Promise<StudentEditData> {
  const s = await db.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      schoolStage: true,
      priorHifzAmount: true,
      emergencyName: true,
      emergencyPhone: true,
      emergencyRelationId: true,
      user: { select: { nameAsInId: true } },
    },
  });
  if (!s) throw verr("studentNotFound");
  return {
    id: s.id,
    name: s.user.nameAsInId,
    schoolStage: s.schoolStage ?? null,
    priorHifzAmount: s.priorHifzAmount ?? null,
    emergencyName: s.emergencyName ?? null,
    emergencyPhone: s.emergencyPhone ?? null,
    emergencyRelationId: s.emergencyRelationId ?? null,
  };
}

export interface UpdateStudentInput {
  schoolStage?: string | null;
  priorHifzAmount?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelationId?: string | null;
}

export async function updateStudent(
  actorId: string,
  studentId: string,
  input: UpdateStudentInput,
  db: PrismaClient = prisma,
): Promise<void> {
  const s = await db.student.findUnique({ where: { id: studentId, deletedAt: null }, select: { id: true } });
  if (!s) throw verr("studentNotFound");

  const data: Record<string, string | null> = {};
  if (input.schoolStage !== undefined) data.schoolStage = input.schoolStage ? input.schoolStage.trim() || null : null;
  if (input.priorHifzAmount !== undefined) data.priorHifzAmount = input.priorHifzAmount ? input.priorHifzAmount.trim() || null : null;
  if (input.emergencyName !== undefined) data.emergencyName = input.emergencyName ? input.emergencyName.trim() || null : null;
  if (input.emergencyPhone !== undefined) data.emergencyPhone = input.emergencyPhone ? input.emergencyPhone.trim() || null : null;
  if (input.emergencyRelationId !== undefined) data.emergencyRelationId = input.emergencyRelationId || null;

  if (Object.keys(data).length === 0) return;

  await db.$transaction([
    db.student.update({ where: { id: studentId }, data }),
    db.auditLog.create({ data: { action: "UPDATE", entity: "Student", entityId: studentId, actorId } }),
  ]);
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
  if (!student) throw aerr("studentNotFound");
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
