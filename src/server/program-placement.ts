import { type ProgramHistoryReason, type Prisma, type PrismaClient } from "@prisma/client";

// ═══════════════ البرنامج صفةٌ في القيد + تاريخه (PLACEMENT_RULES ق١/ق٦) ═══════════════
//
// مصدر برنامج الطالب الوحيد: Enrollment.programId (لا Circle.programId — ذاك الافتراضيّ
// للمنضمّ الجديد). وكلّ دخول/خروج برنامجٍ يُسجَّل في ProgramEnrollmentHistory بسببه.

type Db = PrismaClient | Prisma.TransactionClient;

/** يسجّل دخول الطالب برنامجاً (ق٦) — يُستدعى عند كلّ إنشاء قيدٍ ببرنامج (إسناد/اختبار/تخرّج/تغيير). */
export async function recordProgramEntry(
  db: Db,
  args: { studentId: string; programId: string; reason: ProgramHistoryReason; actorId?: string | null },
): Promise<void> {
  await db.programEnrollmentHistory.create({
    data: { studentId: args.studentId, programId: args.programId, reason: args.reason, actorId: args.actorId ?? null },
  });
}

/** يُغلق سجلّات التاريخ المفتوحة للطالب (exitedAt) — يُستدعى عند إنهاء قيدٍ (نقل/تخرّج). */
export async function closeProgramHistory(db: Db, studentId: string, at: Date = new Date()): Promise<void> {
  await db.programEnrollmentHistory.updateMany({
    where: { studentId, exitedAt: null },
    data: { exitedAt: at },
  });
}

/** برنامج القيد النشط للطالب (المصدر الوحيد). null إن لا قيدٌ نشط أو لم يُبذَر برنامجه. */
export async function activeProgramId(db: Db, studentId: string): Promise<string | null> {
  const e = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { programId: true },
  });
  return e?.programId ?? null;
}
