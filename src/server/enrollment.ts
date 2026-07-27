import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { ValidationError } from "./errors";

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
}

export interface EnrollArgs {
  studentId: string;
  circleId: string;
  actorId: string;
}

/** الانتساب النشط الحاليّ للطالب (أو null). */
export async function getActiveEnrollment(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<EnrollmentRow | null> {
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
    ? { id: e.id, circleId: e.circleId, circleNameAr: e.circle.nameAr, startedAt: e.startedAt, endedAt: e.endedAt }
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
  if (!student) throw new ValidationError("طالب غير موجود.");
  const circle = await db.circle.findUnique({
    where: { id: args.circleId },
    select: { id: true, nameAr: true },
  });
  if (!circle) throw new ValidationError("حلقة غير موجودة.");

  return db.$transaction(async (tx) => {
    const active = await tx.enrollment.findFirst({
      where: { studentId: args.studentId, endedAt: null },
      select: { id: true, circleId: true },
    });

    if (active && active.circleId === args.circleId) {
      throw new ValidationError("الطالب مُسنَدٌ إلى هذه الحلقة فعلًا.");
    }

    if (active) {
      // نقل: أنهِ القديم أولًا (وإلا رفض الفهرس وجود نشطَين).
      await tx.enrollment.update({
        where: { id: active.id },
        data: { endedAt: new Date() },
      });
    }

    const created = await tx.enrollment.create({
      data: { studentId: args.studentId, circleId: args.circleId },
      select: {
        id: true,
        circleId: true,
        startedAt: true,
        endedAt: true,
        circle: { select: { nameAr: true } },
      },
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
