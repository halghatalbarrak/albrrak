import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { AuthorizationError, ValidationError } from "./errors";

// قيد إسناد المُختبِر لمحطات القاعدة المدنية (DESIGN §٧٫٤):
//   «والمُختبِر: ليس معلمه (م١).»
// يُتحقَّق في الخادم؛ حجب الزر في الواجهة لا يُحتسب.

export interface ExaminerCheckArgs {
  examinerUserId: string;
  studentId: string;
}

/** true إن جاز لهذا المُختبِر أن يختبر هذا الطالب (ليس معلمه في أيّ حلقة). */
export async function canExamine(
  args: ExaminerCheckArgs,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId: args.studentId },
    select: { circleId: true },
  });
  const circleIds = enrollments.map((e) => e.circleId);
  if (circleIds.length === 0) return true;

  const teachesAny = await db.circleTeacher.findFirst({
    where: { teacherId: args.examinerUserId, circleId: { in: circleIds } },
    select: { circleId: true },
  });
  return teachesAny === null;
}

/** يرمي AuthorizationError إن كان المُختبِر معلمَ الطالب. */
export async function assertCanExamine(
  args: ExaminerCheckArgs,
  db: PrismaClient = prisma,
): Promise<void> {
  if (!(await canExamine(args, db))) {
    throw new AuthorizationError("لا يجوز أن يختبر المعلمُ طالبَه (م١).");
  }
}

/**
 * يعيد المعلّمين المؤهّلين لاختبار هذا الطالب (ليسوا معلميه).
 * إن كانت القائمة فارغة ⟵ على المسار تنبيه المدير لا الصمت (BUILD_PLAN §م٣).
 */
export async function eligibleExaminers(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<string[]> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw new ValidationError("طالب غير موجود.");

  const enrollments = await db.enrollment.findMany({
    where: { studentId },
    select: { circleId: true },
  });
  const ownTeacherLinks = await db.circleTeacher.findMany({
    where: { circleId: { in: enrollments.map((e) => e.circleId) } },
    select: { teacherId: true },
  });
  const ownTeacherIds = new Set(ownTeacherLinks.map((t) => t.teacherId));

  const allTeachers = await db.circleTeacher.findMany({
    select: { teacherId: true },
    distinct: ["teacherId"],
  });
  return allTeachers
    .map((t) => t.teacherId)
    .filter((id) => !ownTeacherIds.has(id));
}
