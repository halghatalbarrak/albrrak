import { MuddakirDayStatus, MuddakirErrorSource, MuddakirPhase, MuddakirRecitationKind, Role, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  degreeWardCount,
  foldWardDays,
  juzBoundsFromHizb,
  locateInLadder,
  locateWardInDegree,
  makkahDayDate,
  makkahDayBounds,
  wardAyahBound,
  type HizbRow,
  type JuzBound,
  type LadderDegree,
  type WardAyahBound,
  type WardDayEntry,
  type WardDayStatus,
} from "@/lib/muddakir";

import { muddakirProgramId } from "./muddakir-profile";
import { getProgramSetting } from "./settings";
import { emitEvent } from "./events";
import { canExamine } from "./examiner-eligibility";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ محرّك يوم الورد في التثبيت (ت٣، §١٢ + تعديل ١) ═══════════════
//
// الورد مصدره MuddakirEvent (WARD_COMPLETE) كبقيّة المدّكر (PWA offline). يُطوى زمنيّاً من بدء
// التثبيت (اليوم التالي للسرد الختاميّ للحفظ) بمؤشّر التعويض (الورد لا يسقط، فائتٌ واحدٌ يُعرض مع
// ورد الغد، وإلا تأخّر الجدول). المؤشّر يُسقَط على سلّم الدرجات فتُشتقّ الدرجةُ والختمةُ والعدّاد.

const WARD_COMPLETE = "WARD_COMPLETE";
const MS_DAY = 86_400_000;
const dateVal = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);
const dayShift = (iso: string, n: number): string => isoOf(new Date(dateVal(iso).getTime() + n * MS_DAY));
const dayDiff = (later: string, earlier: string): number => Math.round((dateVal(later).getTime() - dateVal(earlier).getTime()) / MS_DAY);

type Db = PrismaClient | Prisma.TransactionClient;

/** سلّم الدرجات المفعّل (مرتّباً) — من MuddakirTathbitDegree. */
async function loadLadder(db: Db): Promise<LadderDegree[]> {
  const rows = await db.muddakirTathbitDegree.findMany({ where: { active: true }, orderBy: { degreeNo: "asc" }, select: { degreeNo: true, dailyJuz: true, khatmaCount: true } });
  return rows;
}

/** حدود الأجزاء الثلاثين من HizbBoundary. */
async function loadJuzBounds(db: Db): Promise<JuzBound[]> {
  const hizb = (await db.hizbBoundary.findMany()) as unknown as HizbRow[];
  if (!hizb.length) throw new Error("حدود الأحزاب غير مبذورة.");
  return juzBoundsFromHizb(hizb);
}

/** بدء التثبيت = اليوم التالي لاجتياز السرد الختاميّ للحفظ (FINAL)، أو null إن لم يتخرّج. */
async function tathbitStart(db: Db, studentId: string): Promise<string | null> {
  const fin = await db.muddakirRecitation.findFirst({
    where: { studentId, kind: "FINAL", passed: true },
    orderBy: { recitedOn: "asc" },
    select: { recitedOn: true },
  });
  return fin ? dayShift(isoOf(fin.recitedOn), 1) : null;
}

/** بدء الورد الدائم = اليوم التالي لاجتياز السرد الختاميّ للتثبيت (§١٢) — فلا يختلط بورد التثبيت الأخير. */
async function permanentStart(db: Db, studentId: string): Promise<string | null> {
  const rec = await db.muddakirRecitation.findFirst({ where: { studentId, kind: "TATHBIT_FINAL", passed: true }, orderBy: { recitedOn: "asc" }, select: { recitedOn: true } });
  return rec ? dayShift(isoOf(rec.recitedOn), 1) : null;
}

/** مقدار الورد الدائم اليوميّ (أجزاء) من Setting (§٩، افتراضيّ ١٠). */
async function permanentWardJuz(db: Db): Promise<number> {
  const pid = await muddakirProgramId(db);
  const v = await getProgramSetting(pid, "permanentWardJuz", db as PrismaClient);
  return typeof v === "number" && v > 0 ? v : 10;
}

/** مجموع ختمات سلّم التثبيت كلّه (أساسُ عدّاد الختمات في الورد الدائم). */
const sumLadderKhatmat = (ladder: LadderDegree[]): number => ladder.reduce((s, d) => s + d.khatmaCount, 0);

/** مدخلات أيّام الورد من البدء حتى اليوم: عدد WARD_COMPLETE وعذرُ كلّ يومٍ مكّيّ. */
async function wardEntries(db: Db, studentId: string, start: string, today: string, now: Date): Promise<WardDayEntry[]> {
  const events = await db.muddakirEvent.findMany({
    where: { studentId, dayDate: { gte: dateVal(start), lte: dateVal(today) }, type: { in: [WARD_COMPLETE, "EXCUSE"] } },
    select: { type: true, dayDate: true },
  });
  const completedBy = new Map<string, number>();
  const excusedOn = new Set<string>();
  for (const e of events) {
    const d = isoOf(e.dayDate);
    if (e.type === WARD_COMPLETE) completedBy.set(d, (completedBy.get(d) ?? 0) + 1);
    else excusedOn.add(d);
  }
  const todayEnd = makkahDayBounds(today).end;
  const entries: WardDayEntry[] = [];
  const span = Math.max(0, dayDiff(today, start));
  for (let i = 0; i <= span; i++) {
    const d = dayShift(start, i);
    entries.push({ dayDate: d, completed: completedBy.get(d) ?? 0, excused: excusedOn.has(d), open: d === today && now < todayEnd });
  }
  return entries;
}

const toDayStatus = (s: WardDayStatus): MuddakirDayStatus =>
  s === "MADE_UP" ? MuddakirDayStatus.MADE_UP
  : s === "SHORTFALL" ? MuddakirDayStatus.SHORTFALL
  : s === "EXCUSED" ? MuddakirDayStatus.EXCUSED
  : s === "OPEN" ? MuddakirDayStatus.OPEN
  : MuddakirDayStatus.COMPLETE;

/** عدّاد الختمات التراكميّ من المؤشّر: ختمات الدرجات المكتملة قبله + ختمات الدرجة الحاليّة. */
function cumulativeKhatmat(pointer: number, ladder: LadderDegree[]): number {
  const loc = locateInLadder(pointer, ladder);
  let before = 0;
  for (const d of ladder) if (loc.done || d.degreeNo < loc.degreeNo) before += d.khatmaCount;
  return loc.done ? before : before + loc.khatmaInDegree;
}

export interface WardView {
  phase: MuddakirPhase;
  active: boolean; // في طور التثبيت وبدأ وردُه
  degreeNo: number;
  dailyJuz: number;
  khatmaInDegree: number;
  cumulativeKhatmat: number;
  finishedLadder: boolean; // أنهى الدرجة العاشرة ⟵ جاهزٌ للختام (ت٦)
  status: MuddakirDayStatus;
  wards: { fromJuz: number; toJuz: number; bound: WardAyahBound }[]; // أوراد اليوم (الفائت أوّلاً)
}

interface WardMapped { slot: { fromJuz: number; toJuz: number }; degreeNo: number; dailyJuz: number; khatmaIndex: number; done: boolean }
interface WardCtx {
  phase: "TATHBIT" | "PERMANENT"; start: string; base: number; ladder: LadderDegree[]; permJuz: number;
  map: (g: number) => WardMapped; // مؤشّرٌ عالميٌّ فعليّ ⟵ موضع الورد
  khatmat: (effective: number) => number; // عدّاد الختمات التراكميّ
}

/** سياق الورد بحسب الطور (التثبيت بالسلّم، أو الدائم بمقدارٍ ثابتٍ لا نهاية له)، أو null إن لم يبدأ. */
async function wardCtx(db: Db, studentId: string, phase: MuddakirPhase, wardsRaised: number, today: string): Promise<WardCtx | null> {
  const ladder = await loadLadder(db);
  if (phase === MuddakirPhase.TATHBIT) {
    const start = await tathbitStart(db, studentId);
    if (!start || today < start) return null;
    return {
      phase: "TATHBIT", start, base: wardsRaised, ladder, permJuz: 0,
      map: (g) => { const loc = locateInLadder(g, ladder); const slot = locateWardInDegree(loc.wardInDegree, loc.dailyJuz); return { slot, degreeNo: loc.degreeNo, dailyJuz: loc.dailyJuz, khatmaIndex: loc.khatmaInDegree, done: loc.done }; },
      khatmat: (eff) => cumulativeKhatmat(eff, ladder),
    };
  }
  // PERMANENT: مقدارٌ ثابتٌ (permanentWardJuz) بلا نهاية؛ العدّاد يبني على مجموع ختمات السلّم.
  const start = await permanentStart(db, studentId);
  if (!start || today < start) return null;
  const permJuz = await permanentWardJuz(db);
  const perKhatma = Math.max(1, Math.ceil(30 / permJuz));
  const base0 = sumLadderKhatmat(ladder);
  return {
    phase: "PERMANENT", start, base: 0, ladder, permJuz,
    map: (g) => { const slot = locateWardInDegree(g, permJuz); return { slot, degreeNo: 0, dailyJuz: permJuz, khatmaIndex: Math.floor(g / perKhatma), done: false }; },
    khatmat: (eff) => base0 + Math.floor(eff / perKhatma),
  };
}

/** يحسب حالة الورد اليوم (قراءةً): أوراد اليوم بحدودها، الدرجة والختمة والعدّاد والحالة. يدعم التثبيت والدائم. */
export async function getWardView(studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<WardView> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true, wardsRaised: true } });
  const empty: WardView = { phase: profile?.phase ?? MuddakirPhase.MEMORIZE, active: false, degreeNo: 0, dailyJuz: 0, khatmaInDegree: 0, cumulativeKhatmat: 0, finishedLadder: false, status: MuddakirDayStatus.OPEN, wards: [] };
  if (!profile || profile.phase === MuddakirPhase.MEMORIZE) return empty;
  const today = makkahDayDate(now);
  const ctx = await wardCtx(db, studentId, profile.phase, profile.wardsRaised, today);
  if (!ctx) return empty;

  const entries = await wardEntries(db, studentId, ctx.start, today, now);
  const fold = foldWardDays(entries);
  const todayRes = fold.days[fold.days.length - 1];
  const pointerBeforeToday = todayRes.pointerAfter - todayRes.completed;

  const juz = await loadJuzBounds(db);
  const wards: WardView["wards"] = [];
  for (let i = 0; i < todayRes.shown; i++) {
    const m = ctx.map(pointerBeforeToday + ctx.base + i);
    if (m.done) break;
    wards.push({ fromJuz: m.slot.fromJuz, toJuz: m.slot.toJuz, bound: wardAyahBound(m.slot, juz) });
  }
  const effective = fold.pointer + ctx.base;
  const here = ctx.map(effective);
  return {
    phase: profile.phase, active: true,
    degreeNo: here.done ? ctx.ladder[ctx.ladder.length - 1]?.degreeNo ?? 0 : here.degreeNo,
    dailyJuz: here.done ? 0 : here.dailyJuz,
    khatmaInDegree: here.khatmaIndex,
    cumulativeKhatmat: ctx.khatmat(effective),
    finishedLadder: ctx.phase === "TATHBIT" && here.done,
    status: toDayStatus(todayRes.status),
    wards,
  };
}

/** يعيد اشتقاق مؤشّر الورد والدرجة والعدّاد وإسقاط يوم اليوم (idempotent). المؤشّر الفعليّ = المُتمّ + إزاحة الرفع. */
export async function deriveWard(db: Db, studentId: string, now: Date = new Date()): Promise<void> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true, wardsRaised: true } });
  if (!profile || profile.phase === MuddakirPhase.MEMORIZE) return;
  const today = makkahDayDate(now);
  const ctx = await wardCtx(db, studentId, profile.phase, profile.wardsRaised, today);
  if (!ctx) return;

  const entries = await wardEntries(db, studentId, ctx.start, today, now);
  const fold = foldWardDays(entries);
  const todayRes = fold.days[fold.days.length - 1];
  const effective = fold.pointer + ctx.base;
  const here = ctx.map(effective);
  const khatmaNo = ctx.khatmat(effective);

  await db.muddakirProfile.update({
    where: { studentId },
    data: {
      wardsCompleted: effective,
      tathbitDegree: ctx.phase === "TATHBIT" ? (here.done ? (ctx.ladder[ctx.ladder.length - 1]?.degreeNo ?? null) : here.degreeNo) : null,
      khatmaInDegree: here.khatmaIndex,
      cumulativeKhatmat: khatmaNo,
    },
  });
  await db.muddakirWardDay.upsert({
    where: { studentId_dayDate: { studentId, dayDate: dateVal(today) } },
    update: { status: toDayStatus(todayRes.status), wardsCompleted: todayRes.completed, degreeNo: here.degreeNo, khatmaNo, phase: profile.phase },
    create: { studentId, dayDate: dateVal(today), phase: profile.phase, degreeNo: here.degreeNo, khatmaNo, status: toDayStatus(todayRes.status), wardsCompleted: todayRes.completed },
  });
}

// ═══════════════ الرفع المبكّر إلى الدرجة التالية (§١٢) ═══════════════

export interface RaiseResult { fromDegree: number; toDegree: number; atKhatma: number }

/**
 * يرفع المشرف الحافظ إلى الدرجة التالية قبل إتمام ختماتها (§١٢): تُقفَز أوراد ما بقي من درجته
 * الحاليّة (إزاحة wardsRaised)، ويُسجَّل الرفع (من/إلى/الختمة) — لا نزول. ثمّ يُعاد الاشتقاق.
 */
export async function raiseDegree(studentId: string, bySupervisorId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<RaiseResult> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true, wardsCompleted: true, wardsRaised: true } });
  if (!profile || profile.phase !== MuddakirPhase.TATHBIT) throw new Error("الرفع المبكّر في طور التثبيت فقط.");
  const ladder = await loadLadder(db);
  const effective = profile.wardsCompleted; // المؤشّر الفعليّ (محدَّثٌ بالاشتقاق)
  const loc = locateInLadder(effective, ladder);
  if (loc.done) throw new Error("أتمّ الحافظ درجات التثبيت.");
  const degree = ladder.find((d) => d.degreeNo === loc.degreeNo)!;
  const remaining = degreeWardCount(degree.dailyJuz, degree.khatmaCount) - loc.wardInDegree; // أوراد ما بقي من الدرجة
  await db.muddakirProfile.update({ where: { studentId }, data: { wardsRaised: profile.wardsRaised + remaining } });
  const toDegree = loc.degreeNo + 1;
  await db.muddakirDegreeRaise.create({ data: { studentId, fromDegree: loc.degreeNo, toDegree, atKhatma: loc.khatmaInDegree + 1, bySupervisorId } });
  await deriveWard(db, studentId, now);
  return { fromDegree: loc.degreeNo, toDegree, atKhatma: loc.khatmaInDegree + 1 };
}

/** يسجّل إتمام وردٍ (حدثٌ idempotent بـclientEventId)، ثمّ يعيد الاشتقاق. */
export async function recordWardComplete(
  args: { studentId: string; clientEventId: string; occurredAt: Date },
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<void> {
  const dayDate = makkahDayDate(args.occurredAt);
  await db.muddakirEvent.createMany({
    data: [{ clientEventId: args.clientEventId, studentId: args.studentId, dayDate: dateVal(dayDate), type: WARD_COMPLETE, occurredAt: args.occurredAt }],
    skipDuplicates: true,
  });
  await deriveWard(db, args.studentId, now);
}

// ═══════════════ السرد الختاميّ للتثبيت (ت٦، §١٢) ═══════════════

export interface RecordTathbitFinalResult { recitationId: string; passed: boolean }

/**
 * يسجّل المختبِر السرد الختاميّ للتثبيت بعد إتمام الدرجة العاشرة (§١٢). لا تصدر الشهادة هنا — بل
 * باعتماد المشرف (approveTathbit). الأخطاء تدخل علاج الأخطاء بمصدر EXAMINER. المختبِر مؤهّلٌ
 * (RECITER/مدير، وليس معلّمَ الحافظ ولا عريفَ حلقته).
 */
export async function recordTathbitFinal(
  args: { examinerUserId: string; studentId: string; passed: boolean; errors?: { page: number; lineNo: number }[] },
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<RecordTathbitFinalResult> {
  const user = await db.user.findUnique({ where: { id: args.examinerUserId }, select: { roles: true } });
  if (!user) throw new AuthorizationError("مستخدم غير موجود.");
  const isManager = user.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER);
  if (!user.roles.includes(Role.RECITER) && !isManager) throw new AuthorizationError("السرد يسجّله المختبِر.");
  if (!(await canExamine({ examinerUserId: args.examinerUserId, studentId: args.studentId }, db))) throw new AuthorizationError("لا يجوز أن يختبر معلّمُ الحافظ ولا عريفُ حلقته.");

  const v = await getWardView(args.studentId, db, now);
  if (v.phase !== MuddakirPhase.TATHBIT || !v.finishedLadder) throw new ValidationError("لم يُتمّ درجات التثبيت بعد.");
  if (await db.muddakirRecitation.findFirst({ where: { studentId: args.studentId, kind: MuddakirRecitationKind.TATHBIT_FINAL, passed: true }, select: { id: true } })) {
    throw new ValidationError("السرد الختاميّ مُجتازٌ فعلاً — بانتظار اعتماد المشرف.");
  }

  const today = makkahDayDate(now);
  const errors = args.errors ?? [];
  for (const e of errors) {
    if (!Number.isInteger(e.page) || !Number.isInteger(e.lineNo)) throw new ValidationError("موضعٌ غير صالح.");
    const line = await db.mushafLine.findUnique({ where: { page_lineNo: { page: e.page, lineNo: e.lineNo } }, select: { page: true } });
    if (!line) throw new ValidationError(`موضعٌ غير موجودٍ في المصحف: ${e.page}/${e.lineNo}.`);
    const exists = await db.muddakirError.findFirst({ where: { studentId: args.studentId, page: e.page, lineNo: e.lineNo, resolvedAt: null }, select: { id: true } });
    if (!exists) await db.muddakirError.create({ data: { studentId: args.studentId, page: e.page, lineNo: e.lineNo, source: MuddakirErrorSource.EXAMINER, openedOn: dateVal(today), recordedById: args.examinerUserId } });
  }
  const rec = await db.muddakirRecitation.create({ data: { studentId: args.studentId, kind: MuddakirRecitationKind.TATHBIT_FINAL, stage: 10, passed: args.passed, examinerId: args.examinerUserId, recitedOn: dateVal(today) }, select: { id: true } });
  await emitEvent(db, { type: args.passed ? "MUDDAKIR_TATHBIT_FINAL_PASSED" : "MUDDAKIR_TATHBIT_FINAL_FAILED", subjectType: "Student", subjectId: args.studentId, actorId: args.examinerUserId, payload: { recitationId: rec.id } });
  return { recitationId: rec.id, passed: args.passed };
}
