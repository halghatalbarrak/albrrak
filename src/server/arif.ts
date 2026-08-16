import { Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";
import { getConsolidation } from "./tarseekh";
import { ayahOrdinal } from "./quran-ordinal";

// ═══════════════ العريف (الحكم ٨) ═══════════════
//
// العريف: طالبٌ متقدّم في الحلقة يساعد المعلّم — يُسمِّع الترسيخ والمراجعة فقط، بإسنادٍ
// من المعلّم وتوثيقه ومسؤوليته. حدوده: لا يُسمِّع الحفظ الجديد (حصريّ للمعلّم)، ولا يختبر
// (الاختبار محايد رسميّ). الأهلية (قرار محمد) شرطان آليّان مانعان + تقدير المعلّم:
//   ١) طالبٌ منتسبٌ نشطًا في الحلقة نفسها.
//   ٢) رسخ من حفظه حزبٌ كاملٌ فأكثر (تغطية حزبٍ كامل — تقاطع الراسخ مع حدود الأحزاب).
// وما زاد على ذلك تقديرُ المعلّم.

/** أدنى ما يُشترط رسوخُه لتعيين العريف: حزبٌ كاملٌ واحد (الحكم ٨). */
const MIN_RASIKH_HIZBS = 1;

/**
 * عدد الأحزاب التي غطّى الطالبُ مداها **راسخًا** بالكامل (الحكم ٨): يُحوّل مقاطعه الراسخة
 * إلى مواضع عالميّة، يدمج المتلاصق منها، ثم يعدّ أحزاب HizbBoundary التي يحتويها مدًى
 * راسخٌ واحدٌ بتمامها. الترسيخ (آخر ١٠) لا يُحسَب — الراسخ وحده (review.segments).
 */
async function fullyRasikhHizbCount(studentId: string, db: PrismaClient): Promise<number> {
  const { review } = await getConsolidation(studentId, db);
  if (review.segments.length === 0) return 0;

  const intervals = review.segments
    .map((s): [number, number] => {
      const a = ayahOrdinal(s.fromSurah, s.fromAyah);
      const b = ayahOrdinal(s.toSurah, s.toAyah);
      return a <= b ? [a, b] : [b, a];
    })
    .sort((x, y) => x[0] - y[0]);

  // دمج المتداخل والمتلاصق (نهاية + ١ = بداية التالي ⟵ متّصلان بلا فجوة).
  const merged: [number, number][] = [];
  for (const [a, b] of intervals) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  const hizbs = await db.hizbBoundary.findMany({
    select: { startSurahNum: true, startAyah: true, endSurahNum: true, endAyah: true },
  });
  let count = 0;
  for (const h of hizbs) {
    const lo = ayahOrdinal(h.startSurahNum, h.startAyah);
    const hi = ayahOrdinal(h.endSurahNum, h.endAyah);
    const [s, e] = lo <= hi ? [lo, hi] : [hi, lo];
    if (merged.some((m) => m[0] <= s && m[1] >= e)) count++;
  }
  return count;
}

/** المعلّم (أو المدير) صاحبُ الحلقة — من يملك تعيين/عزل عريفٍ فيها. */
async function assertTeachesCircle(
  actorId: string, circleId: string, db: PrismaClient,
): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) return;
  const link = await db.circleTeacher.findFirst({
    where: { circleId, teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  if (!link) throw new AuthorizationError("تعيين العريف/عزله لمعلّم الحلقة (الحكم ٨).");
}

/** هل هذا المستخدم عريفٌ نشطٌ (مُسنَد) في هذه الحلقة؟ (يخدم حرّاس التسميع والاختبار). */
export async function isActiveArifForCircle(
  arifUserId: string, circleId: string, db: PrismaClient = prisma,
): Promise<boolean> {
  const a = await db.arifAppointment.findFirst({
    where: { arifUserId, circleId, endedAt: null },
    select: { id: true },
  });
  return a !== null;
}

export interface AppointArifArgs {
  circleId: string;
  arifUserId: string; // العريف (مستخدمٌ = طالبٌ في الحلقة)
  teacherId: string; // المعلّم المُعيِّن (مسؤوليته)
}

/**
 * المعلّم يعيّن طالباً من حلقته عريفاً (الحكم ٨). الأهلية: منتسبٌ نشطًا للحلقة نفسها.
 * لا يُعيَّن عريفٌ نشطٌ مرّتين. لا يعيّن إلا معلّم الحلقة (يُتحقَّق في الخادم).
 */
export async function appointArif(args: AppointArifArgs, db: PrismaClient = prisma) {
  await assertTeachesCircle(args.teacherId, args.circleId, db);

  const student = await db.student.findFirst({
    where: { userId: args.arifUserId },
    select: { id: true },
  });
  const enrolled = student
    ? await db.enrollment.findFirst({
        where: { studentId: student.id, circleId: args.circleId, endedAt: null },
        select: { id: true },
      })
    : null;
  if (!enrolled) {
    throw new ValidationError("العريف طالبٌ منتسبٌ نشطًا في الحلقة نفسها (الحكم ٨).");
  }
  if ((await fullyRasikhHizbCount(student!.id, db)) < MIN_RASIKH_HIZBS) {
    throw new ValidationError(
      "لا يُعيَّن عريفًا إلا من رسخ من حفظه حزبٌ كاملٌ فأكثر (الحكم ٨). راسخ هذا الطالب لا يبلغ حزبًا كاملًا بعد.",
    );
  }
  if (await isActiveArifForCircle(args.arifUserId, args.circleId, db)) {
    throw new ValidationError("هذا الطالب عريفٌ نشطٌ في الحلقة سلفًا.");
  }

  return db.$transaction(async (tx) => {
    const appt = await tx.arifAppointment.create({
      data: { circleId: args.circleId, arifUserId: args.arifUserId, appointedBy: args.teacherId },
    });
    await emitEvent(tx, {
      type: "ARIF_APPOINTED",
      subjectType: "Circle",
      subjectId: args.circleId,
      actorId: args.teacherId,
      payload: { arifUserId: args.arifUserId },
    });
    return appt;
  });
}

export interface DismissArifArgs {
  circleId: string;
  arifUserId: string;
  teacherId: string;
}

/** المعلّم يعزل عريفاً من حلقته (endedAt). لا يعزل إلا معلّم الحلقة. */
export async function dismissArif(args: DismissArifArgs, db: PrismaClient = prisma): Promise<void> {
  await assertTeachesCircle(args.teacherId, args.circleId, db);
  const appt = await db.arifAppointment.findFirst({
    where: { circleId: args.circleId, arifUserId: args.arifUserId, endedAt: null },
    select: { id: true },
  });
  if (!appt) throw new ValidationError("لا تعيين عريفٍ نشطًا لهذا الطالب في الحلقة.");
  await db.$transaction(async (tx) => {
    await tx.arifAppointment.update({ where: { id: appt.id }, data: { endedAt: new Date() } });
    await emitEvent(tx, {
      type: "ARIF_DISMISSED",
      subjectType: "Circle",
      subjectId: args.circleId,
      actorId: args.teacherId,
      payload: { arifUserId: args.arifUserId },
    });
  });
}

export interface ArifRow {
  arifUserId: string;
  name: string;
}

/** عرفاء الحلقة النشطون (للشاشة). */
export async function listCircleArifs(
  circleId: string, db: PrismaClient = prisma,
): Promise<ArifRow[]> {
  const rows = await db.arifAppointment.findMany({
    where: { circleId, endedAt: null },
    select: { arifUserId: true },
  });
  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.arifUserId) } },
    select: { id: true, nameAsInId: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.nameAsInId]));
  return rows
    .map((r) => ({ arifUserId: r.arifUserId, name: nameById.get(r.arifUserId) ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** طلاب الحلقة المؤهّلون للتعيين (منتسبون نشطًا، ليسوا عرفاء نشطين) — يقدّر المعلّم تقدّمهم. */
export async function listAppointableStudents(
  circleId: string, db: PrismaClient = prisma,
): Promise<{ userId: string; name: string }[]> {
  const enrollments = await db.enrollment.findMany({
    where: { circleId, endedAt: null },
    select: { student: { select: { userId: true, user: { select: { nameAsInId: true } } } } },
  });
  const activeArifs = new Set(
    (await db.arifAppointment.findMany({ where: { circleId, endedAt: null }, select: { arifUserId: true } }))
      .map((a) => a.arifUserId),
  );
  return enrollments
    .map((e) => ({ userId: e.student.userId, name: e.student.user.nameAsInId }))
    .filter((s) => !activeArifs.has(s.userId))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
