import { Role, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { makkahDayStart } from "@/lib/makkah-day";
import { aerr, verr } from "./errors";
import { assignMaraqiTrackInTx } from "./track-assignment";
import { suggestTrackForStudent } from "./student-setup";

export type PositionCorrectionReason = "INPUT_ERROR" | "LEVEL_TEST" | "OTHER";

export interface PositionCorrectionInput {
  studentId: string;
  actorId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  reason: PositionCorrectionReason;
  reasonNote?: string;
}

/**
 * تصحيح موضع الطالب في مراقي — للمشرف العام ومدير الحلقة فقط.
 * يُصلح آخر جلسة حفظٍ غير متقنة (أو يُنشئ جلسةً تصحيحية بالأمس) بالنطاق الصحيح + إتقان.
 * يُعيد تعيين المسار المقترح للموضع الجديد. يُسجَّل في AuditLog.
 */
export async function correctStudentPosition(
  input: PositionCorrectionInput,
  db: PrismaClient = prisma,
): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: input.actorId }, select: { roles: true } });
  if (!actor) throw aerr("userNotFound");
  if (!actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) {
    throw aerr("notAuthorized");
  }

  if (
    !Number.isInteger(input.fromSurah) || input.fromSurah < 1 || input.fromSurah > 114 ||
    !Number.isInteger(input.fromAyah) || input.fromAyah < 1 ||
    !Number.isInteger(input.toSurah) || input.toSurah < 1 || input.toSurah > 114 ||
    !Number.isInteger(input.toAyah) || input.toAyah < 1
  ) {
    throw verr("hifzRangeReversed");
  }
  if (!input.reason) throw verr("raiseReasonRequired");
  if (input.reason === "OTHER" && !input.reasonNote?.trim()) throw verr("raiseReasonRequired");

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // ١. أوجد آخر جلسة حفظ غير متقنة
    const lastUnmastered = await tx.dailySession.findFirst({
      where: { studentId: input.studentId, hifzFromSurah: { not: null }, hifzMastered: false },
      orderBy: { date: "desc" },
      select: { id: true, hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true },
    });

    const oldRange = lastUnmastered
      ? `${lastUnmastered.hifzFromSurah}:${lastUnmastered.hifzFromAyah}→${lastUnmastered.hifzToSurah}:${lastUnmastered.hifzToAyah}`
      : null;

    if (lastUnmastered) {
      await tx.dailySession.update({
        where: { id: lastUnmastered.id },
        data: {
          hifzFromSurah: input.fromSurah,
          hifzFromAyah: input.fromAyah,
          hifzToSurah: input.toSurah,
          hifzToAyah: input.toAyah,
          hifzMastered: true,
        },
      });
    } else {
      const enrollment = await tx.enrollment.findFirst({
        where: { studentId: input.studentId, endedAt: null },
        select: { circleId: true },
      });
      if (!enrollment?.circleId) throw verr("sessionStudentHasNoCircle");

      const yesterday = makkahDayStart(new Date(Date.now() - 86_400_000));
      await tx.dailySession.upsert({
        where: { studentId_date: { studentId: input.studentId, date: yesterday } },
        update: {
          hifzFromSurah: input.fromSurah, hifzFromAyah: input.fromAyah,
          hifzToSurah: input.toSurah, hifzToAyah: input.toAyah,
          hifzMastered: true, hifzTeacherId: input.actorId,
        },
        create: {
          studentId: input.studentId, circleId: enrollment.circleId, date: yesterday,
          hifzFromSurah: input.fromSurah, hifzFromAyah: input.fromAyah,
          hifzToSurah: input.toSurah, hifzToAyah: input.toAyah,
          hifzMastered: true, hifzTeacherId: input.actorId,
        },
      });
    }

    // ٢. تسجيل في AuditLog
    await tx.auditLog.create({
      data: {
        action: "POSITION_CORRECTION",
        entity: "Student",
        entityId: input.studentId,
        actorId: input.actorId,
        label: JSON.stringify({
          old: oldRange,
          new: `${input.fromSurah}:${input.fromAyah}→${input.toSurah}:${input.toAyah}`,
          reason: input.reason,
          ...(input.reasonNote ? { note: input.reasonNote } : {}),
        }),
      },
    });
  });

  // ٣. إعادة تعيين المسار المقترح للموضع الجديد (خارج المعاملة لقراءة الحالة المُحدَّثة)
  try {
    const suggestion = await suggestTrackForStudent(input.studentId, db);
    if (suggestion.suggestedTrackId) {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await assignMaraqiTrackInTx(tx, {
          studentId: input.studentId,
          trackId: suggestion.suggestedTrackId!,
          source: "MANUAL",
          actorId: input.actorId,
        });
      });
    }
  } catch {
    // تعيين المسار لا يُوقف التصحيح إن فشل (الموضع صُحِّح)
  }
}
