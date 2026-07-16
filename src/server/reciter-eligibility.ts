import { type PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "./errors";

// قيود إسناد المُسمِّع للحصاد (DESIGN §٨٫٩):
//   م١ — ليس معلم الطالب عبر *كل* حلقاته.
//   م٣ — ليس عريفًا (لا يدخل الحصاد أبدًا).
// تُتحقَّق في الخادم؛ حجب الزر في الواجهة لا يُحتسب.

export interface ReciterCheckArgs {
  reciterUserId: string;
  studentId: string;
}

/** true إن جاز لهذا المُسمِّع أن يحصد هذا الطالب. */
export async function canRecite(
  args: ReciterCheckArgs,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const reciter = await db.user.findUnique({
    where: { id: args.reciterUserId },
    select: { roles: true },
  });
  if (!reciter) return false;

  // م٣: العريف لا يدخل الحصاد أبدًا.
  if (reciter.roles.includes(Role.ARIF)) return false;

  // م١: هل هو معلمٌ في أيّ حلقةٍ للطالب (حاضرة أو سابقة)؟
  const enrollments = await db.enrollment.findMany({
    where: { studentId: args.studentId },
    select: { circleId: true },
  });
  const circleIds = enrollments.map((e) => e.circleId);
  if (circleIds.length === 0) return true;

  const teachesAny = await db.circleTeacher.findFirst({
    where: { teacherId: args.reciterUserId, circleId: { in: circleIds } },
    select: { circleId: true },
  });
  return teachesAny === null;
}

/** يرمي AuthorizationError إن لم يجز الإسناد. */
export async function assertCanRecite(
  args: ReciterCheckArgs,
  db: PrismaClient = prisma,
): Promise<void> {
  if (!(await canRecite(args, db))) {
    throw new AuthorizationError(
      "لا يجوز إسناد هذا المُسمِّع لهذا الطالب (م١/م٣).",
    );
  }
}
