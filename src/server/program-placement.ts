import { ProgramHistoryReason, ProgramKey, StudentState, type Prisma, type PrismaClient } from "@prisma/client";

import { emitEvent } from "./events";
import { toDateOnly } from "./attendance";

// ═══════════════ البرنامج صفةٌ في القيد + انتقالٌ كسولٌ مؤرَّخ (PLACEMENT_RULES ق١/ق٥/ق٦) ═══════════════
//
// مصدر برنامج الطالب الوحيد: Enrollment.programId. وانتقال البرامج (تخرّج القاعدة، ق٥) يُخزَّن
// **مؤجَّلاً بالتاريخ** على الطالب (pending*)، ويُطبَّق **كسولاً** أوّل قراءةٍ في يومٍ ≥ pendingFrom
// عبر **محلّلٍ واحد** (resolveStudentProgram) — بأمانٍ من السباق (تحديثٌ مشروطٌ ذرّيّ). كلّ قراءةٍ
// لبرنامج الطالب تمرّ بهذا المحلّل (ومنها activeCircle)، فلا يُطبَّق الانتقال إلا مرّةً واحدة.

type Db = PrismaClient | Prisma.TransactionClient;
const isClient = (db: Db): db is PrismaClient => "$transaction" in db;

/** «الغد» بمفتاح اليوم المعتمد في المشروع (toDateOnly = منتصف ليل، اتّساقًا مع الحضور والجلسات). */
export function nextDay(from: string | Date = new Date()): Date {
  const d = toDateOnly(from);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** يسجّل دخول الطالب برنامجاً (ق٦) — عند كلّ إنشاء قيدٍ ببرنامج (إسناد/اختبار/تخرّج/تغيير). */
export async function recordProgramEntry(
  db: Db,
  args: { studentId: string; programId: string; reason: ProgramHistoryReason; actorId?: string | null },
): Promise<void> {
  await db.programEnrollmentHistory.create({
    data: { studentId: args.studentId, programId: args.programId, reason: args.reason, actorId: args.actorId ?? null },
  });
}

/** يُغلق سجلّات التاريخ المفتوحة للطالب (exitedAt) — عند إنهاء قيدٍ (نقل/تخرّج). */
export async function closeProgramHistory(db: Db, studentId: string, at: Date = new Date()): Promise<void> {
  await db.programEnrollmentHistory.updateMany({
    where: { studentId, exitedAt: null },
    data: { exitedAt: at },
  });
}

/** برنامج القيد النشط للطالب (المصدر الوحيد). null إن لا قيدٌ نشط أو لم يُبذَر برنامجه. */
export async function activeProgramId(db: Db, studentId: string): Promise<string | null> {
  const e = await db.enrollment.findFirst({ where: { studentId, endedAt: null }, select: { programId: true } });
  return e?.programId ?? null;
}

/** ق٥: يجدول انتقالاً مؤجَّلاً على الطالب (داخل معاملة التخرّج). */
export async function scheduleTransition(
  db: Db,
  args: { studentId: string; nextProgramId: string; trackId: string; from: Date },
): Promise<void> {
  await db.student.update({
    where: { id: args.studentId },
    data: { pendingProgramId: args.nextProgramId, pendingTrackId: args.trackId, pendingFrom: args.from },
  });
}

/** يُلغي الانتقال المعلَّق ويُسجّله (ق٤ من الضوابط: تغييرٌ إداريٌّ سبق التطبيق). */
export async function cancelPendingTransition(db: Db, studentId: string, actorId?: string | null): Promise<boolean> {
  const claim = await db.student.updateMany({
    where: { id: studentId, pendingProgramId: { not: null } },
    data: { pendingProgramId: null, pendingTrackId: null, pendingFrom: null },
  });
  if (claim.count === 0) return false;
  await emitEvent(db, { type: "PROGRAM_TRANSITION_CANCELLED", subjectType: "Student", subjectId: studentId, actorId: actorId ?? null });
  return true;
}

/**
 * (race-safe) يطبّق الانتقال المعلَّق إن حان (pendingFrom ≤ اليوم). **مطالبةٌ ذرّيّة**: updateMany
 * يمسح الحقول WHERE مستحقّة — فإن مسحها قارئٌ آخر (count=0) لا يفعل شيئًا. ثمّ ينهي القيد القديم،
 * وينشئ قيد البرنامج الجديد **في الحلقة نفسها** بالمسار المعلَّق، ويسجّل التاريخ ويضبط الحالة.
 */
async function applyDueOn(tx: Prisma.TransactionClient, studentId: string, today: Date): Promise<void> {
  const s = await tx.student.findUnique({
    where: { id: studentId },
    select: { pendingProgramId: true, pendingTrackId: true, pendingFrom: true },
  });
  if (!s?.pendingProgramId || !s.pendingFrom || toDateOnly(s.pendingFrom).getTime() > today.getTime()) return;
  const programId = s.pendingProgramId;
  const trackId = s.pendingTrackId;

  const claim = await tx.student.updateMany({
    where: { id: studentId, pendingProgramId: programId, pendingFrom: { lte: today } },
    data: { pendingProgramId: null, pendingTrackId: null, pendingFrom: null },
  });
  if (claim.count !== 1) return; // طبّقه قارئٌ متزامنٌ آخر — انتقالٌ واحد

  const active = await tx.enrollment.findFirst({ where: { studentId, endedAt: null }, select: { id: true, circleId: true } });
  const circleId = active?.circleId ?? null;
  if (active) await tx.enrollment.update({ where: { id: active.id }, data: { endedAt: new Date() } });
  await closeProgramHistory(tx, studentId);
  if (!circleId) return; // لا حلقة نشطة — لا يُنشأ قيد (نادر)

  await tx.enrollment.create({ data: { studentId, circleId, programId } });
  if (trackId) await tx.trackAssignment.create({ data: { studentId, trackId, reason: "GRADUATION" } });
  const target = await tx.program.findUnique({ where: { id: programId }, select: { key: true } });
  if (target?.key === ProgramKey.MARAQI) {
    await tx.student.update({ where: { id: studentId }, data: { state: StudentState.IN_MARAQI } });
  }
  await recordProgramEntry(tx, { studentId, programId, reason: ProgramHistoryReason.GRADUATION, actorId: null });
  await emitEvent(tx, {
    type: "PROGRAM_TRANSITION_APPLIED",
    subjectType: "Student", subjectId: studentId, actorId: null,
    payload: { programId, trackId },
  });
}

/**
 * يطبّق الانتقال المستحقّ (إن وُجد). فحصٌ رخيصٌ أوّلاً (بلا معاملة) — فلا تُفتَح معاملةٌ إلا في
 * يوم الاستحقاق النادر. tx-aware: يلفّ في معاملةٍ إن كان العميل رئيسًا، أو يعمل داخل الجارية.
 */
export async function applyDueTransition(db: Db, studentId: string, today: string | Date = new Date()): Promise<void> {
  const t = toDateOnly(today);
  const s = await db.student.findUnique({ where: { id: studentId }, select: { pendingProgramId: true, pendingFrom: true } });
  if (!s?.pendingProgramId || !s.pendingFrom || toDateOnly(s.pendingFrom).getTime() > t.getTime()) return;
  if (isClient(db)) await db.$transaction((tx) => applyDueOn(tx, studentId, t));
  else await applyDueOn(db, studentId, t);
}

export interface ProgramView {
  circleId: string | null;
  programId: string | null;
  programKey: ProgramKey | null;
  /** انتقالٌ معلّقٌ لم يحن بعد — تعرضه الواجهة «ينتقل إلى X في Y». */
  pending: { programKey: ProgramKey; from: Date } | null;
}

/**
 * **المحلّل الواحد** (ق٥/ضابط ٢): يطبّق الانتقال المعلَّق إن حان، ثمّ يعيد برنامج الطالب الفعليّ من
 * قيده (مع ارتداد الحلقة الافتراضيّ) وأيّ انتقالٍ مستقبليٍّ للعرض. كلّ قراءةٍ لبرنامج الطالب تمرّ به.
 */
export async function resolveStudentProgram(db: Db, studentId: string, today: string | Date = new Date()): Promise<ProgramView> {
  await applyDueTransition(db, studentId, today);
  const e = await db.enrollment.findFirst({
    where: { studentId, endedAt: null },
    select: {
      circleId: true, programId: true,
      program: { select: { key: true } },
      circle: { select: { program: { select: { key: true } } } },
    },
  });
  const s = await db.student.findUnique({ where: { id: studentId }, select: { pendingProgramId: true, pendingFrom: true } });
  let pending: ProgramView["pending"] = null;
  if (s?.pendingProgramId && s.pendingFrom) {
    const p = await db.program.findUnique({ where: { id: s.pendingProgramId }, select: { key: true } });
    if (p) pending = { programKey: p.key, from: s.pendingFrom };
  }
  return {
    circleId: e?.circleId ?? null,
    programId: e?.programId ?? null,
    programKey: e ? (e.program?.key ?? e.circle.program.key) : null,
    pending,
  };
}
