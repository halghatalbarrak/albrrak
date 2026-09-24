import {
  PlacementSource, ProgramHistoryReason, ProgramKey, ProgressState, Role, StageKind, StudentState,
  type Prisma, type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";
import { recordProgramEntry, closeProgramHistory, cancelPendingTransition, activeProgramId } from "./program-placement";

// ═══════════════ أفعال التسكين وتغيير البرنامج (PLACEMENT_RULES ق٢/ق٣/ق٧) ═══════════════
//
// ق٧: التسكين وتغيير البرنامج للمشرف العام/مدير الحلقة/المدير التقنيّ. القيود في الخادم.
// التسكين **بلا نقاط** (لا grantAuto). حرٌّ حتى أوّل جلسةٍ فعليّة، وبعدها يُسمَح ويُسجَّل (ق٦).

const PLACERS: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.TECH_ADMIN];

/** ق٧: حارس التسكين/تغيير البرنامج — يرمي إن لم يكن الفاعل من الثلاثة. */
export async function assertCanPlace(db: PrismaClient | Prisma.TransactionClient, actorId: string): Promise<void> {
  const a = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!a || !a.roles.some((r) => PLACERS.includes(r))) {
    throw new AuthorizationError("التسكين وتغيير البرنامج للمشرف/مدير الحلقة/المدير التقنيّ (ق٧).");
  }
}

/** ق٢: تسكين القاعدة — الدروس قبل الحاليّ COMPLETED بمصدر PLACEMENT (بلا نقاط). */
export async function placeQaidahLessons(
  args: { actorId: string; studentId: string; currentLessonId: string },
  db: PrismaClient = prisma,
): Promise<{ placedBefore: number }> {
  await assertCanPlace(db, args.actorId);
  const programId = await activeProgramId(db, args.studentId);
  const cur = programId ? await db.program.findUnique({ where: { id: programId }, select: { key: true } }) : null;
  if (cur?.key !== ProgramKey.QAIDAH_MADANIYYAH) throw new ValidationError("تسكين القاعدة لطلاب القاعدة المدنية.");

  const prog = await db.program.findUnique({ where: { key: ProgramKey.QAIDAH_MADANIYYAH }, select: { id: true } });
  if (!prog) throw new ValidationError("برنامج القاعدة غير مبذور.");
  const lessons = await db.stage.findMany({
    where: { programId: prog.id, kind: StageKind.LESSON },
    orderBy: { ordinal: "asc" },
    select: { id: true },
  });
  const idx = lessons.findIndex((l) => l.id === args.currentLessonId);
  if (idx < 0) throw new ValidationError("الدرس غير موجودٍ في القاعدة.");
  const before = lessons.slice(0, idx);

  return db.$transaction(async (tx) => {
    for (const l of before) {
      // مصدر PLACEMENT يُوسَم عند الإنشاء فقط — فلا يُعاد وسمُ إتقانٍ فعليٍّ سابقٍ (source=null) تسكينًا.
      await tx.stageProgress.upsert({
        where: { studentId_stageId: { studentId: args.studentId, stageId: l.id } },
        update: { state: ProgressState.COMPLETED, completedAt: new Date() },
        create: {
          studentId: args.studentId, stageId: l.id,
          state: ProgressState.COMPLETED, startedAt: new Date(), completedAt: new Date(),
          source: PlacementSource.PLACEMENT,
        },
      });
    }
    const hadSession = await tx.qaidahDailyEval.findFirst({ where: { studentId: args.studentId }, select: { id: true } });
    await emitEvent(tx, {
      type: "QAIDAH_PLACED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId,
      payload: { currentLessonId: args.currentLessonId, placedBefore: before.length, afterFirstSession: !!hadSession },
    });
    return { placedBefore: before.length };
  });
}

export interface OutOfOrderRange { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }

/** ق٣: تسكين مراقي — موضع الوصول (سورة:آية) + نطاقات المحفوظ خارج الترتيب (بلا نقاط). */
export async function placeMaraqi(
  args: { actorId: string; studentId: string; reachedSurah?: number | null; reachedAyah?: number | null; outOfOrder?: OutOfOrderRange[] },
  db: PrismaClient = prisma,
): Promise<{ ok: true }> {
  await assertCanPlace(db, args.actorId);
  const programId = await activeProgramId(db, args.studentId);
  const cur = programId ? await db.program.findUnique({ where: { id: programId }, select: { key: true } }) : null;
  if (cur?.key !== ProgramKey.MARAQI) throw new ValidationError("تسكين مراقي لطلاب مراقي.");

  const ooo = (args.outOfOrder ?? []) as unknown as Prisma.InputJsonValue;
  return db.$transaction(async (tx) => {
    await tx.maraqiPlacement.upsert({
      where: { studentId: args.studentId },
      update: { reachedSurah: args.reachedSurah ?? null, reachedAyah: args.reachedAyah ?? null, outOfOrder: ooo },
      create: { studentId: args.studentId, reachedSurah: args.reachedSurah ?? null, reachedAyah: args.reachedAyah ?? null, outOfOrder: ooo },
    });
    const hadSession = await tx.dailySession.findFirst({ where: { studentId: args.studentId }, select: { id: true } });
    await emitEvent(tx, {
      type: "MARAQI_PLACED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId,
      payload: { reachedSurah: args.reachedSurah ?? null, outOfOrder: (args.outOfOrder ?? []).length, afterFirstSession: !!hadSession },
    });
    return { ok: true };
  });
}

/** ق٧: تغيير برنامج الطالب يدويًّا — يُلغي أيّ انتقالٍ معلّق (ضابط ٤) ويسجّل التاريخ. */
export async function changeStudentProgram(
  args: { actorId: string; studentId: string; programId: string },
  db: PrismaClient = prisma,
): Promise<{ changed: boolean }> {
  await assertCanPlace(db, args.actorId);
  return db.$transaction(async (tx) => {
    const active = await tx.enrollment.findFirst({ where: { studentId: args.studentId, endedAt: null }, select: { id: true, programId: true } });
    if (!active) throw new ValidationError("لا قيدٌ نشطٌ للطالب.");
    const target = await tx.program.findUnique({ where: { id: args.programId }, select: { key: true } });
    if (!target) throw new ValidationError("برنامج غير موجود.");

    await cancelPendingTransition(tx, args.studentId, args.actorId); // ضابط ٤
    if (active.programId === args.programId) return { changed: false };

    await tx.enrollment.update({ where: { id: active.id }, data: { programId: args.programId } });
    await closeProgramHistory(tx, args.studentId);
    await recordProgramEntry(tx, { studentId: args.studentId, programId: args.programId, reason: ProgramHistoryReason.CHANGE, actorId: args.actorId });
    const state = target.key === ProgramKey.MARAQI ? StudentState.IN_MARAQI
      : target.key === ProgramKey.QAIDAH_MADANIYYAH ? StudentState.IN_QAIDAH : null;
    if (state) await tx.student.update({ where: { id: args.studentId }, data: { state } });
    await emitEvent(tx, { type: "PROGRAM_CHANGED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId, payload: { programId: args.programId } });
    return { changed: true };
  });
}
