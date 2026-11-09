import { StudentState, ProgramHistoryReason, type ProgramKey, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { recordProgramEntry, closeProgramHistory, resolveStudentProgram } from "./program-placement";
import { verr } from "./errors";

/**
 * إسناد الطلاب للحلقات ونقلهم (م١ — Enrollment موجود، والقيد partial unique:
 * "Enrollment_one_active_per_student" WHERE endedAt IS NULL).
 *
 * القاعدة المطلقة: **انتساب نشط واحد لكل طالب.** يفرضها الفهرس في القاعدة — فتجاوزها
 * من العميل يُرفض (اختبار). والنقل يُبقي **سجلًّا تاريخيًّا**: يُنهى القديم (endedAt) ويُنشأ
 * الجديد، فلا يُفقد أثرُ أين كان الطالب ومتى.
 */

export interface EnrollmentRow {
  id: string;
  circleId: string;
  circleNameAr: string;
  startedAt: Date;
  endedAt: Date | null;
  /** برنامج القيد الفعليّ (ق١) — يُملأ للقيد النشط عبر المحلّل الواحد. */
  programKey?: ProgramKey | null;
  /** انتقالٌ برنامجيٌّ معلّقٌ لم يحن بعد (ق٥) — تعرضه الواجهة «ينتقل إلى X في Y». */
  pending?: { programKey: ProgramKey; from: Date } | null;
}

export interface EnrollArgs {
  studentId: string;
  circleId: string;
  /** البرنامج يُختار عند التسكين (صفة القيد). إن أُغفل فبرنامج الحلقة الافتراضيّ (توافقًا). */
  programId?: string | null;
  actorId: string;
}

/** الانتساب النشط الحاليّ للطالب (أو null) — عبر المحلّل الواحد (يطبّق المعلّق إن حان، ويُظهره). */
export async function getActiveEnrollment(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<EnrollmentRow | null> {
  const view = await resolveStudentProgram(db, studentId); // ضابط ٢: كلّ عرضٍ للبرنامج يمرّ به
  const e = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: {
      id: true,
      circleId: true,
      startedAt: true,
      endedAt: true,
      circle: { select: { nameAr: true } },
    },
  });
  return e
    ? { id: e.id, circleId: e.circleId, circleNameAr: e.circle.nameAr, startedAt: e.startedAt, endedAt: e.endedAt, programKey: view.programKey, pending: view.pending }
    : null;
}

/** السجلّ التاريخي الكامل لانتساب الطالب (النشط والمنتهي)، الأحدث أولًا. */
export async function getEnrollmentHistory(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<EnrollmentRow[]> {
  const rows = await db.enrollment.findMany({
    where: { studentId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      circleId: true,
      startedAt: true,
      endedAt: true,
      circle: { select: { nameAr: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    circleId: e.circleId,
    circleNameAr: e.circle.nameAr,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
  }));
}

/**
 * يُسند طالبًا إلى حلقة. إن كان له انتساب نشط:
 *   - إلى الحلقة نفسها ⟵ ValidationError (مُسنَدٌ إليها فعلًا، لا عملية).
 *   - إلى حلقةٍ أخرى ⟵ **نقل**: يُنهى القديم ويُنشأ الجديد (سجلٌّ تاريخي).
 * وإلا ⟵ إسنادٌ أوّل.
 */
export async function enrollStudent(
  args: EnrollArgs,
  db: PrismaClient = prisma,
): Promise<EnrollmentRow> {
  const student = await db.student.findUnique({
    where: { id: args.studentId },
    select: { id: true },
  });
  if (!student) throw verr("studentNotFound");
  const circle = await db.circle.findUnique({
    where: { id: args.circleId },
    select: { id: true, nameAr: true, programId: true },
  });
  if (!circle) throw verr("circleNotFound");
  // البرنامج صفةٌ في القيد: المُختار صراحةً، وإلا برنامج الحلقة الافتراضيّ (للحلقات القديمة).
  const programId = args.programId ?? circle.programId;
  if (!programId) throw verr("programRequired");

  return db.$transaction(async (tx) => {
    const active = await tx.enrollment.findFirst({
      where: { studentId: args.studentId, endedAt: null },
      select: { id: true, circleId: true },
    });

    if (active && active.circleId === args.circleId) {
      throw verr("studentAlreadyInThisCircle");
    }

    if (active) {
      // نقل: أنهِ القديم أولًا (وإلا رفض الفهرس وجود نشطَين)، وأغلِق تاريخ برنامجه المفتوح.
      await tx.enrollment.update({
        where: { id: active.id },
        data: { endedAt: new Date() },
      });
      await closeProgramHistory(tx, args.studentId);
    }

    // ق١: البرنامج يُسنَد من برنامج الحلقة الافتراضيّ (يغيّره المشرف لاحقًا بتغيير البرنامج).
    const created = await tx.enrollment.create({
      data: { studentId: args.studentId, circleId: args.circleId, programId },
      select: {
        id: true,
        circleId: true,
        startedAt: true,
        endedAt: true,
        circle: { select: { nameAr: true } },
      },
    });
    // ق٦: تاريخ البرامج — دخولٌ ببرنامج الحلقة (إسنادٌ أوّل، أو تغييرٌ عند النقل).
    await recordProgramEntry(tx, {
      studentId: args.studentId,
      programId,
      reason: active ? ProgramHistoryReason.CHANGE : ProgramHistoryReason.ASSIGNMENT,
      actorId: args.actorId,
    });

    await emitEvent(tx, {
      type: active ? "STUDENT_TRANSFERRED" : "STUDENT_ENROLLED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.actorId,
      payload: active
        ? { fromCircleId: active.circleId, toCircleId: args.circleId }
        : { circleId: args.circleId },
    });

    return {
      id: created.id,
      circleId: created.circleId,
      circleNameAr: created.circle.nameAr,
      startedAt: created.startedAt,
      endedAt: created.endedAt,
    };
  });
}

/** يعلّق انتساب الطالب مؤقّتاً بسببٍ ووقتِ عودةٍ اختياريّ. */
export async function suspendEnrollment(
  actorId: string,
  studentId: string,
  reason: string,
  returnAt: Date | null,
  db: PrismaClient = prisma,
): Promise<void> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { id: true, suspendedAt: true },
  });
  if (!enrollment) throw verr("enrollmentNotFound");
  if (enrollment.suspendedAt) throw verr("enrollmentAlreadySuspended");
  await db.$transaction([
    db.enrollment.update({
      where: { id: enrollment.id },
      data: { suspendedAt: new Date(), suspendedReason: reason, suspendReturnAt: returnAt },
    }),
    db.auditLog.create({
      data: { action: "SUSPEND", entity: "Enrollment", entityId: enrollment.id, actorId, label: reason },
    }),
  ]);
}

/** يرفع تعليق انتساب الطالب. */
export async function resumeEnrollment(
  actorId: string,
  studentId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { id: true, suspendedAt: true },
  });
  if (!enrollment) throw verr("enrollmentNotFound");
  if (!enrollment.suspendedAt) throw verr("enrollmentNotSuspended");
  await db.$transaction([
    db.enrollment.update({
      where: { id: enrollment.id },
      data: { suspendedAt: null, suspendedReason: null, suspendReturnAt: null },
    }),
    db.auditLog.create({
      data: { action: "RESUME", entity: "Enrollment", entityId: enrollment.id, actorId, label: null },
    }),
  ]);
}

/** يفصل الطالب: يُنهي انتسابه النشط ويضبط حالته WITHDRAWN. */
export async function expelStudent(
  actorId: string,
  studentId: string,
  reason: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { id: true },
  });
  if (!enrollment) throw verr("enrollmentNotFound");
  const now = new Date();
  await db.$transaction([
    db.enrollment.update({
      where: { id: enrollment.id },
      data: { endedAt: now },
    }),
    db.student.update({
      where: { id: studentId },
      data: { state: StudentState.WITHDRAWN },
    }),
    db.auditLog.create({
      data: { action: "EXPEL", entity: "Enrollment", entityId: enrollment.id, actorId, label: reason },
    }),
  ]);
}

/**
 * ينقل الطالب إلى حلقةٍ أخرى: يُحدِّث circleId في انتساباته النشطة مباشرةً.
 * لا ينشئ انتساباً جديداً، ولا يمرّ بمنطق التسكين أو البرنامج.
 * التحقّقان الوحيدان: الحلقة موجودة وغير محذوفة، وليست الحلقة الحالية.
 * اختلاف الجنس: تنبيهٌ للواجهة، لا رفضٌ هنا.
 */
export async function transferStudent(
  actorId: string,
  studentId: string,
  circleId: string,
  db: PrismaClient = prisma,
): Promise<{ enrollmentId: string }> {
  const [student, circle] = await Promise.all([
    db.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    db.circle.findUnique({ where: { id: circleId, deletedAt: null }, select: { id: true, nameAr: true } }),
  ]);
  if (!student) throw verr("studentNotFound");
  if (!circle) throw verr("circleNotFound");

  const active = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: { id: true, circleId: true, circle: { select: { nameAr: true } } },
  });
  if (!active) throw verr("noActiveEnrollmentForStudent");
  if (active.circleId === circleId) throw verr("studentAlreadyInThisCircle");

  const fromName = active.circle.nameAr;
  await db.$transaction([
    db.enrollment.updateMany({
      where: { studentId, endedAt: null },
      data: { circleId },
    }),
    db.auditLog.create({
      data: {
        action: "TRANSFER",
        entity: "Student",
        entityId: studentId,
        actorId,
        label: `من ${fromName} إلى ${circle.nameAr}`,
      },
    }),
  ]);

  return { enrollmentId: active.id };
}
