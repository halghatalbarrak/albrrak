import { ProgramKey, StageKind, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { maraqiKey } from "@/lib/maraqi-order";
import { assertCapability } from "./authz";
import { emitEvent } from "./events";
import { maraqiFrontierKey } from "./maraqi-phase";
import { ValidationError } from "./errors";

// ═══════════════ سلّم المسارات — الانتقال الإجباريّ (مراقي ٢، القرار ب) ═══════════════
//
// درجات السلّم = المسارات المفعّلة مرتّبةً (٣ أسطر→٥→نصف صفحة→صفحة→صفحتان). نقطةُ حدّ كلّ مسارٍ
// = نهاية وحداته (أبعد موضعٍ يغطّيه). إن كانت نقطةُ الحدّ **ليست** نهايةَ مرحلةٍ (النبأ/المجادلة)
// ⟵ انتقالٌ **آليّ** ببلوغ الجبهة إيّاها؛ وإن كانت نهايةَ مرحلةٍ (الأحقاف/العنكبوت) ⟵ انتقالٌ
// **بعد اجتياز اختبار المرحلة** (اعتماد المدير). الرفع اليدويّ يرتقي فقط ولا يُخفَض آلياً أبداً.
// المسار الجديد يبدأ من الوحدة التالية لآخر ما حُفظ (nextUnitForStudent) — بلا فجوةٍ ولا تكرار.

type Db = PrismaClient | Prisma.TransactionClient;

export const TRACK_TRANSITION_EVENT = "MARAQI_TRACK_TRANSITION";

interface LadderTrack { id: string; ordinal: number; nameAr: string; endKey: number | null }

/** المسارات المفعّلة مرتّبةً، بمفتاح نهاية كلٍّ (أبعد وحدةٍ بترتيب الحفظ). */
async function loadLadder(db: Db): Promise<LadderTrack[]> {
  const program = await db.program.findUnique({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
  if (!program) return [];
  const tracks = await db.track.findMany({
    where: { programId: program.id, isActive: true },
    orderBy: { ordinal: "asc" },
    select: { id: true, ordinal: true, nameAr: true },
  });
  const out: LadderTrack[] = [];
  for (const t of tracks) {
    const units = await db.trackUnit.findMany({ where: { trackId: t.id }, select: { endSurah: true, endAyah: true } });
    let endKey: number | null = null;
    for (const u of units) { const k = maraqiKey(u.endSurah, u.endAyah); if (endKey === null || k > endKey) endKey = k; }
    out.push({ id: t.id, ordinal: t.ordinal, nameAr: t.nameAr, endKey });
  }
  return out;
}

/** مفاتيح نهايات المراحل (MAIN_STAGE) — حدودٌ مبوَّبةٌ باختبار المرحلة (لا تنتقل آلياً). */
async function phaseEndKeys(db: Db): Promise<Set<number>> {
  const mains = await db.stage.findMany({
    where: { kind: StageKind.MAIN_STAGE, program: { key: ProgramKey.MARAQI }, toSurah: { not: null } },
    select: { toSurah: true, toAyah: true },
  });
  return new Set(mains.filter((m) => m.toSurah != null && m.toAyah != null).map((m) => maraqiKey(m.toSurah!, m.toAyah!)));
}

async function currentAssignment(db: Db, studentId: string): Promise<{ id: string; trackId: string } | null> {
  return db.trackAssignment.findFirst({ where: { studentId, endedAt: null }, orderBy: { startedAt: "desc" }, select: { id: true, trackId: true } });
}

async function switchTrack(
  tx: Prisma.TransactionClient,
  args: { studentId: string; fromAssignmentId: string | null; fromTrackId: string | null; toTrackId: string; reason: string; note?: string; actorId: string | null; auto: boolean },
): Promise<void> {
  if (args.fromAssignmentId) await tx.trackAssignment.update({ where: { id: args.fromAssignmentId }, data: { endedAt: new Date() } });
  await tx.trackAssignment.create({ data: { studentId: args.studentId, trackId: args.toTrackId, reason: args.reason } });
  await emitEvent(tx, {
    type: TRACK_TRANSITION_EVENT,
    subjectType: "Student",
    subjectId: args.studentId,
    actorId: args.actorId,
    payload: { fromTrackId: args.fromTrackId, toTrackId: args.toTrackId, reason: args.reason, auto: args.auto, ...(args.note ? { note: args.note } : {}) },
  });
}

/**
 * الانتقال الآليّ (داخل المرحلة ١): ما دامت الجبهةُ بلغت نهاية مسارها الحاليّ ونقطةُ الحدّ **غير
 * مبوَّبة** (النبأ/المجادلة) ⟵ يرتقي للتالي. يقف عند أوّل حدٍّ مبوَّبٍ (الأحقاف/العنكبوت) أو القمّة.
 * لا يخفض أبداً (لا ينظر إلا للأعلى). يُستدعى داخل معاملة recordHifz.
 */
export async function maybeAutoAdvanceTrack(tx: Prisma.TransactionClient, args: { studentId: string; actorId: string }): Promise<void> {
  const frontier = await maraqiFrontierKey(tx, args.studentId);
  if (frontier === null) return;
  const ladder = await loadLadder(tx);
  if (ladder.length === 0) return;
  const gated = await phaseEndKeys(tx);
  let assignment = await currentAssignment(tx, args.studentId);
  if (!assignment) return;

  for (;;) {
    const curIdx = ladder.findIndex((t) => t.id === assignment!.trackId);
    if (curIdx < 0 || curIdx >= ladder.length - 1) return; // خارج السلّم أو في القمّة
    const cur = ladder[curIdx];
    if (cur.endKey === null || frontier < cur.endKey) return; // لم تبلغ الجبهة نهاية مساره
    if (gated.has(cur.endKey)) return; // حدٌّ مبوَّبٌ باختبار المرحلة — يُنتظر الاعتماد
    const next = ladder[curIdx + 1];
    await switchTrack(tx, { studentId: args.studentId, fromAssignmentId: assignment.id, fromTrackId: cur.id, toTrackId: next.id, reason: "LADDER_AUTO", actorId: args.actorId, auto: true });
    assignment = { id: (await currentAssignment(tx, args.studentId))!.id, trackId: next.id };
  }
}

/**
 * الانتقال المبوَّب بعد اجتياز اختبار المرحلة واعتماده: إن كانت المرحلةُ تنتهي عند حدّ مسارٍ
 * (الأحقاف→صفحة، العنكبوت→صفحتان) والطالبُ ما زال على مسار ذلك الحدّ ⟵ يرتقي للتالي. لا يُخفَض
 * المرفوعُ يدوياً فوقه (لا تغيير إن كان أعلى). يُستدعى داخل معاملة decideStageTransition (الاعتماد).
 */
export async function advanceTrackAfterPhaseExam(tx: Prisma.TransactionClient, args: { studentId: string; mainStageId: string; actorId: string }): Promise<void> {
  const main = await tx.stage.findUnique({ where: { id: args.mainStageId }, select: { toSurah: true, toAyah: true } });
  if (!main || main.toSurah == null || main.toAyah == null) return;
  const phaseEnd = maraqiKey(main.toSurah, main.toAyah);
  const ladder = await loadLadder(tx);
  const idx = ladder.findIndex((t) => t.endKey === phaseEnd); // المسار الذي ينتهي عند حدّ هذه المرحلة
  if (idx < 0 || idx >= ladder.length - 1) return; // لا مسارَ حدُّه هذا (مراحل ٣–٦)، أو القمّة
  const assignment = await currentAssignment(tx, args.studentId);
  if (!assignment || assignment.trackId !== ladder[idx].id) return; // رُفع يدوياً فوقه ⟵ لا تغيير
  await switchTrack(tx, { studentId: args.studentId, fromAssignmentId: assignment.id, fromTrackId: ladder[idx].id, toTrackId: ladder[idx + 1].id, reason: "LADDER_EXAM", actorId: args.actorId, auto: true });
}

export interface RaiseTrackArgs { studentId: string; targetTrackId: string; actorId: string; reason: string }

/** الرفع اليدويّ إلى مسارٍ أعلى (صلاحية TRACK_PROMOTION) — يُسجَّل بصاحبه وسببه؛ ولا يُخفَض آلياً بعده. */
export async function raiseMaraqiTrack(args: RaiseTrackArgs, db: PrismaClient = prisma): Promise<void> {
  await assertCapability(args.actorId, "TRACK_PROMOTION", db);
  const reason = args.reason?.trim();
  if (!reason) throw new ValidationError("سبب الرفع اليدويّ مطلوب.");
  const ladder = await loadLadder(db);
  const targetIdx = ladder.findIndex((t) => t.id === args.targetTrackId);
  if (targetIdx < 0) throw new ValidationError("مسارٌ غير مفعّلٍ أو غير موجودٍ في السلّم.");
  await db.$transaction(async (tx) => {
    const assignment = await currentAssignment(tx, args.studentId);
    const curIdx = assignment ? ladder.findIndex((t) => t.id === assignment.trackId) : -1;
    if (curIdx >= 0 && targetIdx <= curIdx) throw new ValidationError("الرفع اليدويّ إلى مسارٍ أعلى فقط (لا خفض).");
    await switchTrack(tx, { studentId: args.studentId, fromAssignmentId: assignment?.id ?? null, fromTrackId: assignment?.trackId ?? null, toTrackId: args.targetTrackId, reason: "MANUAL_RAISE", note: reason, actorId: args.actorId, auto: false });
  });
}
