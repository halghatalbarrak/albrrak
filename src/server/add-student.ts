/**
 * إضافة طالب سريعة من الشاشة الموحّدة.
 * الخادم يتحقّق من الصلاحية (معلّم الحلقة أو مدير)، والتكرار، ثم يسجّل في AuditLog.
 */
import { Gender, Role, StudentState, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateGuardian } from "./account";
import { aerr, verr } from "./errors";

export interface QuickAddStudentInput {
  nameAsInId: string;
  birthDate: Date;
  gender: Gender;
  guardianPhone: string;
  programId: string;
}

export interface QuickAddResult {
  studentId: string;
  userId: string;
  duplicate: boolean;
}

/** يتحقّق أنّ المعلّم يدرّس الحلقة، أو أنّ الفاعل مدير. */
export async function assertCanAddToCircle(
  actorId: string,
  actorRoles: Role[],
  circleId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const isAdmin =
    actorRoles.includes(Role.SUPER_ADMIN) ||
    actorRoles.includes(Role.CIRCLE_MANAGER);
  if (isAdmin) return;
  const link = await db.circleTeacher.findFirst({
    where: { circleId, teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  if (!link) throw aerr("sessionOwnStudentsOnly");
}

/**
 * يُضيف طالبًا سريعًا: User + Student + Enrollment + GuardianLink + AuditLog.
 * التكرار: نفس الاسم في نفس الحلقة → يُرجع duplicate:true بدون إنشاء.
 */
export async function quickAddStudent(
  actorId: string,
  circleId: string,
  input: QuickAddStudentInput,
  db: PrismaClient = prisma,
): Promise<QuickAddResult> {
  if (!input.nameAsInId.trim()) throw verr("quickAddNameRequired");
  if (!input.guardianPhone.trim()) throw verr("quickAddGuardianPhoneRequired");
  if (!input.programId) throw verr("quickAddProgramRequired");

  // تحقّق من التكرار: نفس الاسم في نفس الحلقة (إنذار لا حجب)
  const existingEnrollment = await db.enrollment.findFirst({
    where: {
      circleId,
      endedAt: null,
      student: { deletedAt: null, user: { nameAsInId: input.nameAsInId.trim() } },
    },
    select: { id: true },
  });
  if (existingEnrollment) {
    // أعد الطالب الموجود بدون إنشاء جديد
    const existing = await db.enrollment.findFirst({
      where: { id: existingEnrollment.id },
      select: { student: { select: { id: true, userId: true } } },
    });
    return {
      studentId: existing!.student.id,
      userId: existing!.student.userId,
      duplicate: true,
    };
  }

  // إنشاء الولي (أو البحث عنه)
  const guardian = await findOrCreateGuardian(db, {
    guardianPhone: input.guardianPhone,
    guardianGender: Gender.MALE, // افتراضيّ — يُحدَّث لاحقًا في إعداد الطالب
  });

  return db.$transaction(async (tx) => {
    // سجلّ المستخدم (بلا authId — الطالب أقلّ من ١٣ أو لم يُكمَّل الإعداد)
    const user = await tx.user.create({
      data: {
        nameAsInId: input.nameAsInId.trim(),
        birthDate: input.birthDate,
        gender: input.gender,
        roles: [Role.STUDENT],
        authId: null,
      },
    });

    const student = await tx.student.create({
      data: {
        userId: user.id,
        state: StudentState.AWAITING_READING_TEST,
      },
    });

    // القيد في الحلقة
    await tx.enrollment.create({
      data: {
        studentId: student.id,
        circleId,
        programId: input.programId,
      },
    });

    // ربط الولي
    await tx.guardianLink.create({
      data: {
        guardianId: guardian.id,
        studentId: student.id,
        status: "ACTIVE",
      },
    });

    // AuditLog
    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Student",
        entityId: student.id,
        actorId,
        label: `quick-add:${circleId}`,
      },
    });

    return { studentId: student.id, userId: user.id, duplicate: false };
  });
}
