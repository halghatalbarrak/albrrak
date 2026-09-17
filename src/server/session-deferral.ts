import { Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { COUNTED_STATUSES, toDateOnly } from "./attendance";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ حالة الجلسة «مؤجَّل» (مشترَكة بين البرنامجين) ═══════════════
//
// MARAQI_RULES / QAIDAH_RULES: الطالب حاضرٌ جاهزٌ لم يُسمَّع/يُقيَّم لضيق الوقت. توثيقٌ
// محايدٌ إيجابيّ:
//   • يُحسب حاضراً أدّى — لا خصم، لا غياب/تقصير، ولا حدثٌ سالب.
//   • لا نقاط تسميع (لم يُسمَّع فعلاً) — لا حدث منحٍ للتسميع.
//   • **الموضع ثابت** — لا يمسّ StageProgress ولا يُنشئ جلسة تقييم. «مؤجَّل» لا ينقل أبداً.
//   • يتطلّب حضوراً — لا يُسجَّل لغائب.
//
// تفويضٌ مستقلٌّ هنا (لا استيراد من daily-session) لتجنّب دورة الاستيراد — نفس دلالة
// assertTeachesStudent: معلّم حلقة الطالب النشطة أو الإدارة.

async function assertActorTeachesStudent(
  actorId: string,
  studentId: string,
  db: PrismaClient,
): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { circleId: true },
  });
  if (!enrollment) throw new ValidationError("الطالب غير منتسبٍ لحلقة.");
  if (actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) return;
  const link = await db.circleTeacher.findFirst({
    where: { circleId: enrollment.circleId, teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  if (!link) throw new AuthorizationError("لا تَرصد إلا جلسات طلابك (§٨٫٣).");
}

export interface DeferArgs {
  studentId: string;
  actorId: string;
  date?: string | Date; // الافتراض: اليوم
}

/**
 * يسجّل «مؤجَّل» لطالبٍ حاضر. يفوّض معلّم الحلقة/الإدارة، ويتطلّب حضور الطالب هذا اليوم.
 * لا يحرّك الموضع ولا يمنح/يخصم — سطرٌ محايدٌ + حدثٌ غير اقتصاديّ. idempotent: مرّةً لليوم.
 */
export async function deferSession(
  args: DeferArgs,
  db: PrismaClient = prisma,
): Promise<{ date: Date }> {
  await assertActorTeachesStudent(args.actorId, args.studentId, db);
  const date = toDateOnly(args.date ?? new Date());

  // يتطلّب حضوراً: حالة حضور الطالب لهذا اليوم محسوبةٌ حضورًا (لا يُسجَّل لغائب).
  const att = await db.attendance.findUnique({
    where: { studentId_date: { studentId: args.studentId, date } },
    select: { status: true },
  });
  if (!att || !COUNTED_STATUSES.has(att.status)) {
    throw new ValidationError("«مؤجَّل» يتطلّب حضور الطالب هذا اليوم — لا يُسجَّل لغائب.");
  }

  await db.deferredSession.upsert({
    where: { studentId_date: { studentId: args.studentId, date } },
    update: { recordedBy: args.actorId },
    create: { studentId: args.studentId, date, recordedBy: args.actorId },
  });
  await emitEvent(db, {
    type: "SESSION_DEFERRED",
    subjectType: "Student",
    subjectId: args.studentId,
    actorId: args.actorId,
    payload: { date: date.toISOString().slice(0, 10) },
  });
  return { date };
}

/** أحدث تاريخِ تأجيلٍ للطالب (null إن لا شيء) — لعرض «آخر جلسة مؤجَّلة». */
export async function latestDeferralDate(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<Date | null> {
  const row = await db.deferredSession.findFirst({
    where: { studentId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

/** معرّفات الطلاب المؤجَّلين ليومٍ معيّن (للوحة الجلسة). */
export async function deferredStudentIdsForDate(
  studentIds: string[],
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const d = toDateOnly(date);
  const rows = await db.deferredSession.findMany({
    where: { studentId: { in: studentIds }, date: d },
    select: { studentId: true },
  });
  return new Set(rows.map((r) => r.studentId));
}
