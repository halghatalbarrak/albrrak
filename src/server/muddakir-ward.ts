import { MuddakirDayStatus, MuddakirPhase, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
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

/** يحسب حالة الورد اليوم (قراءةً): أوراد اليوم بحدودها، الدرجة والختمة والعدّاد والحالة. */
export async function getWardView(studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<WardView> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true } });
  const empty: WardView = { phase: profile?.phase ?? MuddakirPhase.MEMORIZE, active: false, degreeNo: 0, dailyJuz: 0, khatmaInDegree: 0, cumulativeKhatmat: 0, finishedLadder: false, status: MuddakirDayStatus.OPEN, wards: [] };
  if (!profile || profile.phase !== MuddakirPhase.TATHBIT) return empty;
  const start = await tathbitStart(db, studentId);
  const today = makkahDayDate(now);
  if (!start || today < start) return empty;

  const ladder = await loadLadder(db);
  const entries = await wardEntries(db, studentId, start, today, now);
  const fold = foldWardDays(entries);
  const todayRes = fold.days[fold.days.length - 1];
  const pointerBeforeToday = todayRes.pointerAfter - todayRes.completed;

  // أوراد اليوم المعروضة: المؤشّرات العالميّة [pointerBeforeToday .. +shown-1].
  const juz = await loadJuzBounds(db);
  const wards: WardView["wards"] = [];
  for (let i = 0; i < todayRes.shown; i++) {
    const loc = locateInLadder(pointerBeforeToday + i, ladder);
    if (loc.done) break;
    const slot = locateWardInDegree(loc.wardInDegree, loc.dailyJuz);
    wards.push({ fromJuz: slot.fromJuz, toJuz: slot.toJuz, bound: wardAyahBound(slot, juz) });
  }
  const here = locateInLadder(fold.pointer, ladder);
  return {
    phase: MuddakirPhase.TATHBIT, active: true,
    degreeNo: here.done ? ladder[ladder.length - 1]?.degreeNo ?? 0 : here.degreeNo,
    dailyJuz: here.done ? 0 : here.dailyJuz,
    khatmaInDegree: here.khatmaInDegree,
    cumulativeKhatmat: cumulativeKhatmat(fold.pointer, ladder),
    finishedLadder: here.done,
    status: toDayStatus(todayRes.status),
    wards,
  };
}

/** يعيد اشتقاق مؤشّر الورد والدرجة والعدّاد وإسقاط يوم اليوم (idempotent). */
export async function deriveWard(db: Db, studentId: string, now: Date = new Date()): Promise<void> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true } });
  if (!profile || profile.phase !== MuddakirPhase.TATHBIT) return;
  const start = await tathbitStart(db, studentId);
  const today = makkahDayDate(now);
  if (!start || today < start) return;

  const ladder = await loadLadder(db);
  const entries = await wardEntries(db, studentId, start, today, now);
  const fold = foldWardDays(entries);
  const todayRes = fold.days[fold.days.length - 1];
  const loc = locateInLadder(fold.pointer, ladder);

  await db.muddakirProfile.update({
    where: { studentId },
    data: {
      wardsCompleted: fold.pointer,
      tathbitDegree: loc.done ? (ladder[ladder.length - 1]?.degreeNo ?? null) : loc.degreeNo,
      khatmaInDegree: loc.khatmaInDegree,
      cumulativeKhatmat: cumulativeKhatmat(fold.pointer, ladder),
    },
  });
  await db.muddakirWardDay.upsert({
    where: { studentId_dayDate: { studentId, dayDate: dateVal(today) } },
    update: { status: toDayStatus(todayRes.status), wardsCompleted: todayRes.completed, degreeNo: loc.degreeNo, khatmaNo: cumulativeKhatmat(fold.pointer, ladder) },
    create: { studentId, dayDate: dateVal(today), phase: MuddakirPhase.TATHBIT, degreeNo: loc.degreeNo, khatmaNo: cumulativeKhatmat(fold.pointer, ladder), status: toDayStatus(todayRes.status), wardsCompleted: todayRes.completed },
  });
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
