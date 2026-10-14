import { ApprovalKind, ApprovalStatus, Role, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { makkahDayDate, makkahDayStart, dayDiff } from "@/lib/makkah-day";

import { assertCanRecordCircle } from "./attendance";
import { assertCapability } from "./authz";
import { propose, decide } from "./approval";
import { emitEvent } from "./events";
import { ValidationError, verr, aerr } from "./errors";

// ═══════════════ قفل يوم الحضور (المهمّة ٩ — docs/ATTENDANCE_LOCK_RULES.md) ═══════════════
//
// الحالة مشتقّةٌ من سجلّ Event الملحق (لا عمود حالةٍ مخزَّن، لا جدول جديد). مفتاح اليوم يوم مكّة
// (src/lib/makkah-day). القفل التلقائيّ محسوبٌ بلا cron: اليوم مقفلٌ إن اعتُمد أو تجاوز مهلته.

type Db = PrismaClient | Prisma.TransactionClient;

const GRACE_KEY = "attendance.lockGraceDays";
const DEFAULT_GRACE_DAYS = 1;

/** نوع موضوع أحداث قفل اليوم، ومعرّفه = «الحلقة:اليوم المكّيّ». */
const SUBJECT_TYPE = "AttendanceDay";
const dayId = (circleId: string, dateISO: string) => `${circleId}:${dateISO}`;

export const EV_APPROVED = "ATTENDANCE_DAY_APPROVED";
export const EV_UNLOCK_REQUESTED = "ATTENDANCE_UNLOCK_REQUESTED";
export const EV_UNLOCKED = "ATTENDANCE_DAY_UNLOCKED";
export const EV_UNLOCK_REJECTED = "ATTENDANCE_UNLOCK_REJECTED";

export type DayLockState = "OPEN" | "APPROVED" | "AUTO_LOCKED" | "TEMP_OPEN";

export interface DayLock {
  circleId: string;
  date: string; // YYYY-MM-DD بتوقيت مكّة
  state: DayLockState;
  locked: boolean;
  graceDays: number;
}

/** يوم مكّة (YYYY-MM-DD) لمدخلٍ تاريخيّ — المفتاح الموحّد. */
function toMakkahDay(input: string | Date): string {
  return makkahDayDate(typeof input === "string" ? new Date(input) : input);
}

// ═══════════════ مهلة القفل (إعدادٌ عامّ، بلا رقمٍ ثابت في الكود) ═══════════════

/** مهلة القفل (أيّام) من Setting العامّ — أو الافتراضيّة ١ إن لم تُضبط. */
export async function getLockGraceDays(db: Db = prisma): Promise<number> {
  const row = await db.setting.findFirst({ where: { key: GRACE_KEY }, select: { value: true } });
  const v = typeof row?.value === "number" ? row.value : Number(row?.value);
  return Number.isInteger(v) && v >= 0 ? v : DEFAULT_GRACE_DAYS;
}

/** يضبط مهلة القفل العامّة (صفٌّ واحدٌ بلا programId) ويُسجّل الحدث بصاحبه. */
export async function setLockGraceDays(days: number, actorId: string, db: PrismaClient = prisma): Promise<void> {
  if (!Number.isInteger(days) || days < 0) throw verr("lockGraceNonNegative");
  await assertCapability(actorId, "ATTENDANCE_UNLOCK", db); // صاحب صلاحيّة القفل يضبط مهلته
  await db.$transaction(async (tx) => {
    const existing = await tx.setting.findFirst({ where: { key: GRACE_KEY }, select: { id: true } });
    if (existing) await tx.setting.update({ where: { id: existing.id }, data: { value: days } });
    else await tx.setting.create({ data: { key: GRACE_KEY, value: days } });
    await emitEvent(tx, { type: "SETTING_CHANGED", subjectType: "AttendanceLock", subjectId: GRACE_KEY, actorId, payload: { key: GRACE_KEY, value: days } });
  });
}

// ═══════════════ اشتقاق حالة القفل ═══════════════

/**
 * حالة قفل (حلقة، يوم) مشتقّةٌ من آخر حدثٍ حاسم مع الزمن:
 *   • آخر حدثٍ حاسم UNLOCKED ويومُه = اليوم المكّيّ الآن ⟵ TEMP_OPEN (مفتوحٌ مؤقّتاً).
 *   • وُجد اعتمادٌ (APPROVED) ⟵ APPROVED (مقفل) [الفتح المنتهي يعود لقفل الاعتماد].
 *   • لا اعتماد، وتجاوز فرقُ الأيّام المهلةَ ⟵ AUTO_LOCKED.
 *   • وإلّا ⟵ OPEN.
 */
export async function getAttendanceDayLock(
  circleId: string,
  date: string | Date,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<DayLock> {
  const dateISO = toMakkahDay(date);
  const graceDays = await getLockGraceDays(db);
  const today = makkahDayDate(now);

  const events = await db.event.findMany({
    where: { subjectType: SUBJECT_TYPE, subjectId: dayId(circleId, dateISO), type: { in: [EV_APPROVED, EV_UNLOCKED] } },
    orderBy: { createdAt: "desc" },
    select: { type: true, createdAt: true },
  });

  let state: DayLockState;
  const decisive = events[0];
  if (decisive?.type === EV_UNLOCKED && makkahDayDate(decisive.createdAt) === today) {
    state = "TEMP_OPEN";
  } else if (events.some((e) => e.type === EV_APPROVED)) {
    state = "APPROVED";
  } else if (dayDiff(today, dateISO) > graceDays) {
    state = "AUTO_LOCKED";
  } else {
    state = "OPEN";
  }

  return { circleId, date: dateISO, state, locked: state === "APPROVED" || state === "AUTO_LOCKED", graceDays };
}

/** يرمي ValidationError إن كان يوم الحلقة مقفلاً (للرصد اللحظيّ — §٣). */
export async function assertAttendanceDayOpen(
  circleId: string,
  date: string | Date,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<void> {
  const lock = await getAttendanceDayLock(circleId, date, db, now);
  if (lock.locked) {
    const why = lock.state === "APPROVED" ? "معتمَدٌ من المعلّم" : "قفلٌ تلقائيّ (انقضت مهلته)";
    throw new ValidationError(`اليوم مقفلٌ (${why}) — اطلب فتحه لتعديل الرصد.`, "attendanceDayLocked");
  }
}

// ═══════════════ اعتماد المعلّم (قفلٌ فوريّ) ═══════════════

/** «اعتماد حضور اليوم» لحلقة المعلّم — يقفل اليوم فوراً (حدثٌ ملحق). */
export async function approveAttendanceDay(
  circleId: string,
  date: string | Date,
  actorId: string,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<DayLock> {
  await assertCanRecordCircle(actorId, circleId, db);
  const dateISO = toMakkahDay(date);
  await emitEvent(db, { type: EV_APPROVED, subjectType: SUBJECT_TYPE, subjectId: dayId(circleId, dateISO), actorId, payload: { circleId, date: dateISO } });
  return getAttendanceDayLock(circleId, dateISO, db, now);
}

// ═══════════════ فتح القفل ═══════════════

export interface UnlockRequestArgs {
  circleId: string;
  date: string | Date;
  reason: string;
  requestedBy: string;
}

/** طلب المعلّم فتحَ يومٍ مقفل — عبر محرّك الاعتمادات (ATTENDANCE_UNLOCK). */
export async function requestAttendanceUnlock(args: UnlockRequestArgs, db: PrismaClient = prisma, now: Date = new Date()) {
  await assertCanRecordCircle(args.requestedBy, args.circleId, db);
  const reason = args.reason?.trim();
  if (!reason) throw verr("unlockRequestReasonRequired");
  const dateISO = toMakkahDay(args.date);

  const lock = await getAttendanceDayLock(args.circleId, dateISO, db, now);
  if (!lock.locked) throw verr("dayNotLocked");

  const sid = dayId(args.circleId, dateISO);
  const pendingDup = await db.approval.findFirst({
    where: { kind: ApprovalKind.ATTENDANCE_UNLOCK, status: ApprovalStatus.PENDING, subjectId: sid },
    select: { id: true },
  });
  if (pendingDup) throw verr("unlockRequestPending");

  const approval = await propose(
    { kind: ApprovalKind.ATTENDANCE_UNLOCK, subjectType: SUBJECT_TYPE, subjectId: sid, proposedBy: args.requestedBy, payload: { circleId: args.circleId, date: dateISO, reason } },
    db,
  );
  await emitEvent(db, { type: EV_UNLOCK_REQUESTED, subjectType: SUBJECT_TYPE, subjectId: sid, actorId: args.requestedBy, payload: { circleId: args.circleId, date: dateISO, reason, approvalId: approval.id } });
  return approval;
}

export interface DecideUnlockArgs {
  approvalId: string;
  decidedBy: string;
  decision: "APPROVED" | "REJECTED";
  note?: string;
}

/** بتّ طلب الفتح — لمن يملك صلاحية ATTENDANCE_UNLOCK. القبول يفتح اليوم؛ الرفض يبقيه مقفلاً. */
export async function decideAttendanceUnlock(args: DecideUnlockArgs, db: PrismaClient = prisma) {
  await assertCapability(args.decidedBy, "ATTENDANCE_UNLOCK", db);
  const appr = await db.approval.findUnique({ where: { id: args.approvalId }, select: { kind: true, subjectId: true, status: true, payload: true } });
  if (!appr || appr.kind !== ApprovalKind.ATTENDANCE_UNLOCK) throw verr("unlockRequestNotFound");

  const decided = await decide({ approvalId: args.approvalId, decidedBy: args.decidedBy, decision: args.decision, note: args.note }, db);
  const p = (decided.payload ?? {}) as { circleId?: string; date?: string; reason?: string };
  if (args.decision === "APPROVED") {
    await emitEvent(db, { type: EV_UNLOCKED, subjectType: SUBJECT_TYPE, subjectId: appr.subjectId, actorId: args.decidedBy, payload: { circleId: p.circleId, date: p.date, reason: p.reason, via: "request" } });
  } else {
    await emitEvent(db, { type: EV_UNLOCK_REJECTED, subjectType: SUBJECT_TYPE, subjectId: appr.subjectId, actorId: args.decidedBy, payload: { circleId: p.circleId, date: p.date, note: args.note?.trim() ?? null } });
  }
  return decided;
}

export interface DirectUnlockArgs {
  circleId: string;
  date: string | Date;
  reason: string;
  actorId: string;
}

/** فتحٌ مباشرٌ من صاحب صلاحية ATTENDANCE_UNLOCK (بسببٍ مكتوب، بلا طلب). */
export async function unlockAttendanceDay(args: DirectUnlockArgs, db: PrismaClient = prisma, now: Date = new Date()): Promise<DayLock> {
  await assertCapability(args.actorId, "ATTENDANCE_UNLOCK", db);
  const reason = args.reason?.trim();
  if (!reason) throw verr("unlockReasonRequired");
  const dateISO = toMakkahDay(args.date);
  await emitEvent(db, { type: EV_UNLOCKED, subjectType: SUBJECT_TYPE, subjectId: dayId(args.circleId, dateISO), actorId: args.actorId, payload: { circleId: args.circleId, date: dateISO, reason, via: "direct" } });
  return getAttendanceDayLock(args.circleId, dateISO, db, now);
}

// ═══════════════ قوائم المدير (عرضٌ فقط) ═══════════════

export interface UnlockRequestRow {
  approvalId: string;
  circleId: string;
  circleName: string;
  date: string;
  reason: string;
  requestedBy: string;
  proposedAt: string;
}

async function assertManager(actorId: string, db: PrismaClient): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor || !actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) {
    throw aerr("attendanceListForAdmin");
  }
}

/** طلبات الفتح المعلّقة (للبتّ). للإدارة فقط. */
export async function listUnlockRequests(actorId: string, db: PrismaClient = prisma): Promise<UnlockRequestRow[]> {
  await assertManager(actorId, db);
  const rows = await db.approval.findMany({
    where: { kind: ApprovalKind.ATTENDANCE_UNLOCK, status: ApprovalStatus.PENDING },
    orderBy: { proposedAt: "asc" },
    select: { id: true, proposedBy: true, proposedAt: true, payload: true },
  });
  const circleIds = [...new Set(rows.map((r) => (r.payload as { circleId?: string } | null)?.circleId).filter(Boolean) as string[])];
  const circles = await db.circle.findMany({ where: { id: { in: circleIds } }, select: { id: true, nameAr: true } });
  const nameOf = new Map(circles.map((c) => [c.id, c.nameAr]));
  return rows.map((r) => {
    const p = (r.payload ?? {}) as { circleId?: string; date?: string; reason?: string };
    return {
      approvalId: r.id,
      circleId: p.circleId ?? "",
      circleName: nameOf.get(p.circleId ?? "") ?? "—",
      date: p.date ?? "",
      reason: p.reason ?? "",
      requestedBy: r.proposedBy,
      proposedAt: r.proposedAt.toISOString(),
    };
  });
}

export interface UnapprovedDayRow {
  circleId: string;
  circleName: string;
  date: string;
  state: DayLockState;
}

const WINDOW_DAYS = 30;

/** أيّامٌ رُصد فيها حضورٌ ولم يعتمدها المعلّم (آخر ٣٠ يوماً مكّيّاً). للإدارة فقط. */
export async function listUnapprovedDays(actorId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<UnapprovedDayRow[]> {
  await assertManager(actorId, db);
  const today = makkahDayDate(now);
  const windowStart = makkahDayStart(new Date(now.getTime() - WINDOW_DAYS * 86_400_000));
  const graceDays = await getLockGraceDays(db);

  // أيّامٌ فيها رصدٌ (حلقة، يوم) ضمن النافذة.
  const att = await db.attendance.findMany({
    where: { date: { gte: windowStart } },
    select: { circleId: true, date: true },
    distinct: ["circleId", "date"],
  });
  if (att.length === 0) return [];

  // أحداث القفل ضمن النافذة (اعتماد/فتح) — تُجمَّع مرّةً لا لكلّ يوم.
  const evs = await db.event.findMany({
    where: { subjectType: SUBJECT_TYPE, type: { in: [EV_APPROVED, EV_UNLOCKED] }, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "desc" },
    select: { subjectId: true, type: true, createdAt: true },
  });
  const approved = new Set<string>();
  const activeUnlock = new Set<string>();
  for (const e of evs) {
    if (e.type === EV_APPROVED) approved.add(e.subjectId);
    else if (e.type === EV_UNLOCKED && makkahDayDate(e.createdAt) === today) activeUnlock.add(e.subjectId);
  }

  const circleIds = [...new Set(att.map((a) => a.circleId))];
  const circles = await db.circle.findMany({ where: { id: { in: circleIds } }, select: { id: true, nameAr: true } });
  const nameOf = new Map(circles.map((c) => [c.id, c.nameAr]));

  const out: UnapprovedDayRow[] = [];
  for (const a of att) {
    const dISO = makkahDayDate(a.date);
    const sid = dayId(a.circleId, dISO);
    if (approved.has(sid)) continue; // اعتمده المعلّم ⟵ ليس في القائمة
    const state: DayLockState = activeUnlock.has(sid) ? "TEMP_OPEN" : dayDiff(today, dISO) > graceDays ? "AUTO_LOCKED" : "OPEN";
    out.push({ circleId: a.circleId, circleName: nameOf.get(a.circleId) ?? "—", date: dISO, state });
  }
  return out.sort((x, y) => (y.date.localeCompare(x.date)) || x.circleName.localeCompare(y.circleName, "ar"));
}
