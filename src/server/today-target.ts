import { ProgramKey, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getCircleSessionBoard, getHifzGate, getStudentPosition, type BoardStudent } from "./daily-session";
import { maraqiKey, unitsForTrack, type UnitRow } from "./track-units";
import { getStudentErrorTally, orderSegmentsByWeakness } from "./weakness-map";

// ═══════════════ وجهة اليوم (م٤ — الثمرة النهائيّة) ═══════════════
//
// دالّةٌ واحدةٌ تحسب مهامّ اليوم الثلاث بحدودها (سورة:آية)، فوق الأساس القائم بلا مساسٍ به.
// حسم محمد: **المقطع = وحدة المسار (TrackUnit)**، لا جلسة؛ و**المراجعة = الراسخ فقط** (ما خرج
// من نافذة الترسيخ العشرة). فالمهامّ تُشتقّ من وحدات المسار التي بلغها الطالب (موضعه):
//   ١) الحفظ الجديد المقترح: الوحدة التالية لموضعه (الحكم ١: إن لم يُتقن أمسِ ⟵ إعادة).
//   ٢) الترسيخ: آخر ١٠ وحداتٍ سابقة (لا تشمل وحدة اليوم).
//   ٣) المراجعة: الراسخ (ما قبل العشر) مقسَّمٌ ٥ حصص، تنازليًّا من الأحدث للأقدم (جزء ٣٠)؛
//      حصّة اليوم بحدودها، والأضعف أوّلاً (الفكرة ٣). اقتراحٌ وعرضٌ فقط.

const TARSEEKH_WINDOW = 10; // الحكم ٢
const CIRCLE_DAYS_PER_WEEK = 5; // الحكم ٤ (الأحد→الخميس)

export interface AyahBound {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

export type NewHifzSuggestion =
  | { kind: "NEW"; bound: AyahBound } // الوحدة التالية
  | { kind: "REPEAT"; bound: AyahBound } // إعادةُ أمسِ (الحكم ١)
  | { kind: "COMPLETED" } // أتمّ محفوظ المسار
  | { kind: "NO_TRACK" }; // لم يُسنَد مسارٌ بعد

export interface TodayTarget {
  status: "ACTIVE" | "ON_LEAVE" | "NOT_MARAQI" | "INACTIVE";
  newHifz: NewHifzSuggestion | null;
  tarseekh: AyahBound[]; // آخر ١٠ وحداتٍ سابقة، بحدودها
  murajaah: { dayNo: number | null; totalStock: number; todaySlice: AyahBound[] } | null;
}

function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const unitBound = (u: UnitRow): AyahBound => ({ fromSurah: u.startSurah, fromAyah: u.startAyah, toSurah: u.endSurah, toAyah: u.endAyah });

/** يحلّل نطاقات المحفوظ خارج الترتيب المسكَّن (JSON) إلى حدودٍ صالحة، متجاهلاً التالف. */
function parseOutOfOrder(raw: unknown): AyahBound[] {
  if (!Array.isArray(raw)) return [];
  const out: AyahBound[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    if ([o.fromSurah, o.fromAyah, o.toSurah, o.toAyah].every((n) => typeof n === "number")) {
      out.push({ fromSurah: o.fromSurah as number, fromAyah: o.fromAyah as number, toSurah: o.toSurah as number, toAyah: o.toAyah as number });
    }
  }
  return out;
}

/** إجازة مرحلةٍ نشطة (لم تنقضِ مهلتها) ⟵ توقّفٌ تامّ، لا وجهة (البند ١). */
async function onStageExamLeave(studentId: string, today: Date, db: PrismaClient): Promise<boolean> {
  const leave = await db.stageExamLeave.findFirst({ where: { studentId, effectiveEndsOn: { gte: today } }, select: { id: true } });
  return leave !== null;
}

/** أبعدُ موضعٍ بلغه الطالب قبل اليوم (مفتاح مراقي لأقصى نهايةِ جلسة حفظٍ سابقة)، أو null. */
async function frontierBeforeToday(studentId: string, today: Date, db: PrismaClient): Promise<number | null> {
  const sessions = await db.dailySession.findMany({
    where: { studentId, hifzToSurah: { not: null }, date: { lt: today } },
    select: { hifzToSurah: true, hifzToAyah: true },
  });
  let best: number | null = null;
  for (const s of sessions) {
    if (s.hifzToSurah == null) continue;
    const k = maraqiKey(s.hifzToSurah, s.hifzToAyah ?? 1);
    if (best === null || k > best) best = k;
  }
  return best;
}

/**
 * يحسب وجهة اليوم لطالبٍ (مراقي) من وحدات مساره. حالاتٌ حديّة: غير مراقي ⟵ NOT_MARAQI؛ في
 * إجازة مرحلة ⟵ ON_LEAVE؛ بلا حلقةٍ نشطة ⟵ INACTIVE. وإلا ACTIVE بمهامّه الثلاث.
 */
export async function todayTarget(
  studentId: string,
  date: string | Date = new Date(),
  db: PrismaClient = prisma,
): Promise<TodayTarget> {
  const today = toDateOnly(date);
  const empty: TodayTarget = { status: "INACTIVE", newHifz: null, tarseekh: [], murajaah: null };

  let position;
  try {
    position = await getStudentPosition(studentId, db);
  } catch {
    return empty;
  }
  if (position.program !== ProgramKey.MARAQI) return { ...empty, status: "NOT_MARAQI" };
  if (await onStageExamLeave(studentId, today, db)) return { ...empty, status: "ON_LEAVE" };

  // مسار الطالب ووحداته، وموضعه فيها (عدد الوحدات التي بلغها قبل اليوم).
  const assignment = await db.trackAssignment.findFirst({ where: { studentId, endedAt: null }, orderBy: { startedAt: "desc" }, select: { trackId: true } });
  const units = assignment ? await unitsForTrack(assignment.trackId, db) : [];

  // التسكين (ق٣): موضع الوصول المسكَّن + المحفوظ خارج الترتيب يُدمجان مع الجلسات.
  const placement = await db.maraqiPlacement.findUnique({
    where: { studentId },
    select: { reachedSurah: true, reachedAyah: true, outOfOrder: true },
  });
  const sessFrontier = await frontierBeforeToday(studentId, today, db);
  const placedFrontier = placement?.reachedSurah != null ? maraqiKey(placement.reachedSurah, placement.reachedAyah ?? 1) : null;
  const frontier = sessFrontier == null ? placedFrontier
    : placedFrontier == null ? sessFrontier : Math.max(sessFrontier, placedFrontier);
  const reached = frontier === null ? 0 : units.filter((u) => maraqiKey(u.startSurah, u.startAyah) <= frontier).length;

  // محفوظٌ خارج الترتيب (ضمن نطاقات التسكين): يدخل المراجعة فورًا، ويتخطّاه الحفظ الجديد.
  const oooRanges = parseOutOfOrder(placement?.outOfOrder);
  const isOutOfOrder = (u: UnitRow) => oooRanges.some((r) =>
    maraqiKey(u.startSurah, u.startAyah) >= maraqiKey(r.fromSurah, r.fromAyah) &&
    maraqiKey(u.endSurah, u.endAyah) <= maraqiKey(r.toSurah, r.toAyah));

  const inOrder = units.slice(0, reached); // المحفوظ بالترتيب (١..reached)
  const rasikhCut = Math.max(0, reached - TARSEEKH_WINDOW);
  const tarseekhUnits = inOrder.slice(rasikhCut); // آخر ١٠ بالترتيب
  const oooUnits = units.slice(reached).filter(isOutOfOrder); // محفوظٌ خارج الترتيب (راسخٌ فورًا)
  const rasikhUnits = [...inOrder.slice(0, rasikhCut), ...oooUnits]; // الراسخ: قديم الترتيب + خارج الترتيب

  // ── الحفظ الجديد: أوّل وحدةٍ غير محفوظةٍ بالترتيب، تتخطّى المحفوظ خارج الترتيب ──
  const gate = await getHifzGate(studentId, today, db);
  let nextIdx = reached;
  while (nextIdx < units.length && isOutOfOrder(units[nextIdx])) nextIdx++;
  let newHifz: NewHifzSuggestion;
  if (gate.mustRepeat && gate.range) newHifz = { kind: "REPEAT", bound: gate.range };
  else if (!assignment) newHifz = { kind: "NO_TRACK" };
  else if (nextIdx < units.length) newHifz = { kind: "NEW", bound: unitBound(units[nextIdx]) };
  else newHifz = { kind: "COMPLETED" };

  // ── المراجعة: الراسخ ٥ حصص، تنازليًّا من الأحدث للأقدم؛ حصّة اليوم، الأضعف أوّلاً ──
  const weekday = today.getUTCDay(); // ٠=الأحد … ٦=السبت
  const sliceIndex = weekday <= CIRCLE_DAYS_PER_WEEK - 1 ? weekday : null; // الجمعة/السبت لا حصّة
  let todaySlice: AyahBound[] = [];
  if (sliceIndex !== null && rasikhUnits.length > 0) {
    const newestFirst = rasikhUnits.slice().reverse(); // الأحدث (موضع الطالب) أوّلاً
    const daySegs = newestFirst
      .filter((_, i) => Math.floor((i * CIRCLE_DAYS_PER_WEEK) / newestFirst.length) === sliceIndex)
      .map(unitBound);
    const tally = await getStudentErrorTally(studentId, db); // الفكرة ٣: الأضعف أوّلاً
    todaySlice = orderSegmentsByWeakness(daySegs, tally);
  }

  return {
    status: "ACTIVE",
    newHifz,
    tarseekh: tarseekhUnits.map(unitBound),
    murajaah: { dayNo: sliceIndex === null ? null : sliceIndex + 1, totalStock: rasikhUnits.length, todaySlice },
  };
}

// ─────────── لوحة الجلسة مع وجهة اليوم (للمعلّم) ───────────

export interface BoardStudentWithTarget extends BoardStudent {
  today: TodayTarget;
}

/** لوحة الجلسة لحلقةٍ + وجهة اليوم لكل طالب (اقتراحٌ جاهزٌ للمعلّم). يلفّ getCircleSessionBoard. */
export async function sessionBoardWithTarget(
  actorId: string,
  circleId: string,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<{ circle: { id: string; nameAr: string } | null; students: BoardStudentWithTarget[] }> {
  const board = await getCircleSessionBoard(actorId, circleId, date, db);
  const students: BoardStudentWithTarget[] = [];
  for (const s of board.students) students.push({ ...s, today: await todayTarget(s.studentId, date, db) });
  return { circle: board.circle, students };
}
