import { AutoEventType, PointGrantSource, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";
import { getProgramSetting, setProgramSetting } from "./settings";
import { muddakirProgramId } from "./muddakir-profile";

// ═══════════════ إعدادات المدّكر الإداريّة (و٣، §٩/§١٢) ═══════════════
//
// إدارة سلّم التثبيت، وإعدادات البرنامج المسموحة، وبنود النقاط الخاصّة بالمدّكر (AUTO لأحداث
// MUDDAKIR_*)، وعرض سجلّ الرفع المبكّر. التنفيذ المباشر للمدير؛ والإداريّ بطلبٍ (executeRequest).

type Db = PrismaClient | Prisma.TransactionClient;

/** مفاتيح إعدادات المدّكر المسموح ضبطها (§٩/§١٢) — لا مفتاحَ خارجها. */
export const MUDDAKIR_SETTING_KEYS = [
  "stageJuzCount", "tracks", "newReps", "firstCleanReps", "yesterdayReps", "ribatWindowDays",
  "reviewCycleDays", "treatmentLineReps", "treatmentCleanSessions", "weakFaceThreshold",
  "maxHafizPerSupervisor", "meetingDay", "monthlyExcuseLimit", "weeklySurpriseJuz", "permanentWardJuz",
] as const;

/** أحداث المدّكر التلقائيّة — بنودها وحدها يحرّرها مدير البرنامج (بقيّة الاقتصاد لمدير المنصّة). */
export const MUDDAKIR_AUTO_EVENTS: readonly AutoEventType[] = [
  AutoEventType.MUDDAKIR_DAY_COMPLETE, AutoEventType.MUDDAKIR_FACE_HEARD,
  AutoEventType.MUDDAKIR_STAGE_COMPLETE, AutoEventType.MUDDAKIR_SHORTFALL,
];

// ── سلّم التثبيت ──

export interface LadderRow { degreeNo: number; dailyJuz: number; khatmaDays: number; khatmaCount: number; active: boolean }

export async function listTathbitLadder(db: Db = prisma): Promise<LadderRow[]> {
  return db.muddakirTathbitDegree.findMany({ orderBy: { degreeNo: "asc" }, select: { degreeNo: true, dailyJuz: true, khatmaDays: true, khatmaCount: true, active: true } });
}

/** يعدّل درجةً في سلّم التثبيت (أعدادٌ موجبة). لا يُنشئ درجةً جديدة — السلّم مبذورٌ بعشر درجات. */
export async function setTathbitDegree(degreeNo: number, patch: { dailyJuz?: number; khatmaDays?: number; khatmaCount?: number; active?: boolean }, actorId: string, db: Db = prisma): Promise<void> {
  const existing = await db.muddakirTathbitDegree.findUnique({ where: { degreeNo }, select: { degreeNo: true } });
  if (!existing) throw new ValidationError("درجةٌ غير موجودة.");
  const data: { dailyJuz?: number; khatmaDays?: number; khatmaCount?: number; active?: boolean } = {};
  for (const k of ["dailyJuz", "khatmaDays", "khatmaCount"] as const) {
    const v = patch[k];
    if (v != null) { if (!Number.isInteger(v) || v < 1) throw new ValidationError(`${k} عددٌ صحيحٌ موجب.`); data[k] = v; }
  }
  if (patch.active != null) data.active = patch.active;
  if (Object.keys(data).length === 0) return;
  await db.muddakirTathbitDegree.update({ where: { degreeNo }, data });
  await emitEvent(db, { type: "MUDDAKIR_LADDER_CHANGED", subjectType: "MuddakirTathbitDegree", subjectId: String(degreeNo), actorId, payload: data });
}

// ── الإعدادات ──

export async function listMuddakirSettings(db: Db = prisma): Promise<Record<string, Prisma.JsonValue | null>> {
  const pid = await muddakirProgramId(db);
  const out: Record<string, Prisma.JsonValue | null> = {};
  for (const k of MUDDAKIR_SETTING_KEYS) out[k] = await getProgramSetting(pid, k, db as PrismaClient);
  return out;
}

/** يضبط إعداد مدّكرٍ من القائمة المسموحة فقط. */
export async function setMuddakirSetting(key: string, value: Prisma.InputJsonValue, actorId: string, db: Db = prisma): Promise<void> {
  if (!(MUDDAKIR_SETTING_KEYS as readonly string[]).includes(key)) throw new ValidationError("مفتاح إعدادٍ غير مسموح.");
  const pid = await muddakirProgramId(db);
  await setProgramSetting({ programId: pid, key, value, actorId }, db as PrismaClient);
}

// ── بنود نقاط المدّكر (AUTO لأحداث MUDDAKIR_* وحدها) ──

export interface MuddakirPointItemInput { id?: string; nameAr: string; value: number; eventType: AutoEventType; active?: boolean }

/** يُنشئ/يعدّل بند نقاطٍ خاصّاً بالمدّكر (AUTO مربوطٌ بحدث MUDDAKIR_*). حدثٌ واحدٌ لبندٍ مفعّلٍ واحد. */
export async function setMuddakirPointItem(input: MuddakirPointItemInput, actorId: string, db: Db = prisma): Promise<{ id: string }> {
  if (!MUDDAKIR_AUTO_EVENTS.includes(input.eventType)) throw new ValidationError("البند خارج أحداث المدّكر.");
  const nameAr = input.nameAr?.trim();
  if (!nameAr) throw new ValidationError("اسم البند مطلوب.");
  if (!Number.isInteger(input.value) || input.value === 0) throw new ValidationError("قيمة البند عددٌ صحيحٌ غير صفر.");
  const active = input.active ?? true;
  // حدثٌ واحدٌ لبندٍ مفعّلٍ واحد: لا يُربط الحدث ببندٍ آخر مفعّل.
  const conflict = await db.autoGrantRule.findFirst({ where: { eventType: input.eventType, active: true, ...(input.id ? { pointItemId: { not: input.id } } : {}) }, select: { id: true } });
  if (conflict && active) throw new ValidationError("هذا الحدث مربوطٌ ببندٍ مفعّلٍ آخر.");

  const item = input.id
    ? await db.pointItem.update({ where: { id: input.id }, data: { nameAr, value: input.value, grantSource: PointGrantSource.AUTO, active } })
    : await db.pointItem.create({ data: { nameAr, value: input.value, grantSource: PointGrantSource.AUTO, active } });
  await db.autoGrantRule.upsert({ where: { pointItemId: item.id }, update: { eventType: input.eventType, active }, create: { pointItemId: item.id, eventType: input.eventType, active } });
  await emitEvent(db, { type: input.id ? "POINT_ITEM_UPDATED" : "POINT_ITEM_CREATED", subjectType: "PointItem", subjectId: item.id, actorId, payload: { eventType: input.eventType, value: input.value, muddakir: true } });
  return { id: item.id };
}

export interface MuddakirPointRow { id: string; nameAr: string; value: number; active: boolean; eventType: AutoEventType }

/** بنود نقاط المدّكر (AUTO المربوطة بأحداث MUDDAKIR_*). */
export async function listMuddakirPointItems(db: Db = prisma): Promise<MuddakirPointRow[]> {
  const rules = await db.autoGrantRule.findMany({ where: { eventType: { in: [...MUDDAKIR_AUTO_EVENTS] } }, select: { pointItemId: true, eventType: true, active: true } });
  if (!rules.length) return [];
  const items = await db.pointItem.findMany({ where: { id: { in: rules.map((r) => r.pointItemId) } }, select: { id: true, nameAr: true, value: true, active: true } });
  const evBy = new Map(rules.map((r) => [r.pointItemId, r.eventType]));
  return items.map((i) => ({ id: i.id, nameAr: i.nameAr, value: i.value, active: i.active, eventType: evBy.get(i.id)! }));
}

// ── سجلّ الرفع المبكّر ──

export interface RaiseLogRow { id: string; studentName: string; fromDegree: number; toDegree: number; atKhatma: number; by: string; createdAt: Date }

export async function listDegreeRaises(db: PrismaClient = prisma): Promise<RaiseLogRow[]> {
  const rows = await db.muddakirDegreeRaise.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const byIds = [...new Set(rows.map((r) => r.bySupervisorId))];
  const students = studentIds.length ? await db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, user: { select: { nameAsInId: true } } } }) : [];
  const users = byIds.length ? await db.user.findMany({ where: { id: { in: byIds } }, select: { id: true, nameAsInId: true } }) : [];
  const sName = new Map(students.map((s) => [s.id, s.user.nameAsInId]));
  const uName = new Map(users.map((u) => [u.id, u.nameAsInId]));
  return rows.map((r) => ({ id: r.id, studentName: sName.get(r.studentId) ?? "—", fromDegree: r.fromDegree, toDegree: r.toDegree, atKhatma: r.atKhatma, by: uName.get(r.bySupervisorId) ?? "—", createdAt: r.createdAt }));
}
