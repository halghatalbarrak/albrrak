import {
  MuddakirDayStatus,
  MuddakirExcuseReason,
  MuddakirFaceState,
  type MuddakirEvent,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  makkahDayBounds,
  newFacesForDay,
  reviewSliceForDay,
  ribatWindow,
  foldDay as foldEvents,
  type FaceStateInput,
  type MushafFaceData,
} from "@/lib/muddakir";

import { getProgramSetting } from "./settings";
import { muddakirProgramId } from "./muddakir-profile";

// ═══════════════ محرّك اليوم (المرحلة ٤) ═══════════════
//
// المصدر الوحيد للحقيقة هو MuddakirEvent (مزامنة PWA §٨). MuddakirDay/MuddakirDayFace **إسقاطٌ
// ماديّ** يُعاد اشتقاقه من الأحداث دائمًا (بترتيب occurredAt)، فلا يتعارض ترتيب الوصول. حكم اليوم
// (إتمام/قضاء/تقصير) بتوقيت مكّة وبحسابٍ كسولٍ عند القراءة — لا cron. كل الأرقام من Setting.

type Db = PrismaClient | Prisma.TransactionClient;

const MS_DAY = 86_400_000;
const dateVal = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);
const dayShift = (iso: string, n: number): string => isoOf(new Date(dateVal(iso).getTime() + n * MS_DAY));

// ── الإعدادات (§٩) من Setting، بقيمٍ افتراضيّة — لا رقمَ مكتوبٌ في المنطق ──
export interface DayEngineSettings {
  newReps: number;
  firstCleanReps: number;
  yesterdayReps: number;
  ribatWindowDays: Record<string, number>;
  reviewCycleDays: number;
  tracks: number[];
}

const asNum = (v: unknown, d: number): number => (typeof v === "number" && v > 0 ? v : d);

export async function loadDayEngineSettings(db: Db, programId?: string): Promise<DayEngineSettings> {
  const pid = programId ?? (await muddakirProgramId(db));
  const get = (k: string) => getProgramSetting(pid, k, db as PrismaClient);
  const [newReps, firstClean, yReps, ribatWin, cycle, tracks] = await Promise.all([
    get("newReps"), get("firstCleanReps"), get("yesterdayReps"), get("ribatWindowDays"), get("reviewCycleDays"), get("tracks"),
  ]);
  return {
    newReps: asNum(newReps, 30),
    firstCleanReps: asNum(firstClean, 3),
    yesterdayReps: asNum(yReps, 10),
    ribatWindowDays: ribatWin && typeof ribatWin === "object" ? (ribatWin as Record<string, number>) : { "1": 20, "2": 15, "3": 10 },
    reviewCycleDays: asNum(cycle, 7),
    tracks: Array.isArray(tracks) ? (tracks as number[]) : [1, 2, 3],
  };
}

// ── طيّ أحداث يومٍ واحد (بترتيب occurredAt) ⟵ إسقاطٌ محايدٌ لترتيب الوصول ──
interface FaceCounters { reps: number; repErrors: number; yesterdayReps: number }
interface DayFold {
  faces: Map<number, FaceCounters>;
  newPages: Set<number>;
  ribatDone: boolean;
  reviewDone: boolean;
  excuseReason: MuddakirExcuseReason | null;
  completedAt: Date | null;
  makeupForDate: string | null;
}

const payloadStr = (e: MuddakirEvent, key: string): string | null => {
  const v = (e.payload as Record<string, unknown> | null)?.[key];
  return typeof v === "string" ? v : null;
};
const pageOf = (e: MuddakirEvent): number | null => {
  const p = (e.payload as { page?: unknown } | null)?.page;
  return typeof p === "number" ? p : null;
};

/** يطوي أحداث Prisma عبر الدالّة النقيّة المشتركة (نفسها على الجهاز). */
function foldDay(events: MuddakirEvent[], firstCleanReps: number): DayFold {
  const r = foldEvents(
    events.map((e) => ({ type: e.type, occurredAtMs: e.occurredAt.getTime(), page: pageOf(e), reason: payloadStr(e, "reason"), makeupForDate: payloadStr(e, "makeupForDate") })),
    firstCleanReps,
  );
  const reason = r.excuseReason && r.excuseReason in MuddakirExcuseReason ? (r.excuseReason as MuddakirExcuseReason) : null;
  return {
    faces: r.faces, newPages: r.newPages, ribatDone: r.ribatDone, reviewDone: r.reviewDone,
    excuseReason: reason, completedAt: r.completedAtMs != null ? new Date(r.completedAtMs) : null, makeupForDate: r.makeupForDate,
  };
}

// ── حساب حالة اليوم (كسولٌ، بتوقيت مكّة) ──
export interface StatusInput {
  dayDate: string;
  completedAt: Date | null;
  excused: boolean;
  isMakeup: boolean; // هذا اليوم نفسه يومُ قضاءٍ (makeupForDate مضبوط)
  madeUpOn: Date | null; // لحظة قضاءٍ ناجحٍ لهذا اليوم (من حدثٍ في الغد ضمن نافذته) أو null
  now: Date;
}

/** الحالة الفعليّة ليوم (§٥): إتمام ← عذر ← (بعد منتصف الليل) قضاء/تقصير، وإلا OPEN. */
export function computeDayStatus(inp: StatusInput): MuddakirDayStatus {
  if (inp.completedAt) return inp.isMakeup ? MuddakirDayStatus.MADE_UP : MuddakirDayStatus.COMPLETE;
  if (inp.excused) return MuddakirDayStatus.EXCUSED;
  const dayEnd = makkahDayBounds(inp.dayDate).end;
  const nextEnd = makkahDayBounds(dayShift(inp.dayDate, 1)).end;
  if (inp.now < dayEnd) return MuddakirDayStatus.OPEN;
  if (inp.madeUpOn) return MuddakirDayStatus.MADE_UP;
  if (inp.now >= nextEnd) return MuddakirDayStatus.SHORTFALL;
  return MuddakirDayStatus.PENDING_MAKEUP;
}

/** هل قُضي يومٌ مفقودٌ بنجاح؟ حدثُ MAKEUP_COMPLETE في الغد ضمن نافذته [نهايةُ اليوم، نهايةُ الغد). */
async function makeupInfo(db: Db, studentId: string, dayDate: string): Promise<{ madeUpOn: Date | null; makeupDayId: string | null }> {
  const next = dayShift(dayDate, 1);
  const ev = await db.muddakirEvent.findFirst({
    where: { studentId, type: "MAKEUP_COMPLETE", dayDate: dateVal(next) },
    orderBy: { occurredAt: "asc" },
  });
  if (!ev) return { madeUpOn: null, makeupDayId: null };
  const d = (ev.payload as { makeupForDate?: unknown } | null)?.makeupForDate;
  if (d !== dayDate) return { madeUpOn: null, makeupDayId: null };
  const dayEnd = makkahDayBounds(dayDate).end;
  const nextEnd = makkahDayBounds(next).end;
  if (ev.occurredAt < dayEnd || ev.occurredAt >= nextEnd) return { madeUpOn: null, makeupDayId: null };
  const makeupDay = await db.muddakirDay.findUnique({ where: { studentId_dayDate: { studentId, dayDate: dateVal(next) } }, select: { id: true } });
  return { madeUpOn: ev.occurredAt, makeupDayId: makeupDay?.id ?? null };
}

/**
 * يعيد اشتقاق يومٍ من أحداثه (idempotent): يُحدِّث MuddakirDay وMuddakirDayFace، ويُرقّي حالة الأوجه
 * (NEW → IN_RIBAT عند بلوغ التكرار)، ويحسب الحالة كسولًا بتوقيت مكّة. `now` قابلٌ للحقن للاختبار.
 */
export async function deriveDay(db: Db, studentId: string, dayDate: string, now: Date = new Date()): Promise<void> {
  const settings = await loadDayEngineSettings(db);
  const events = await db.muddakirEvent.findMany({ where: { studentId, dayDate: dateVal(dayDate) } });
  const fold = foldDay(events, settings.firstCleanReps);

  const newPages = [...fold.newPages];
  const newFrom = newPages.length ? Math.min(...newPages) : null;
  const newTo = newPages.length ? Math.max(...newPages) : null;

  const { madeUpOn, makeupDayId } = fold.makeupForDate ? { madeUpOn: null, makeupDayId: null } : await makeupInfo(db, studentId, dayDate);
  const status = computeDayStatus({
    dayDate, completedAt: fold.completedAt, excused: fold.excuseReason != null,
    isMakeup: fold.makeupForDate != null, madeUpOn, now,
  });

  const day = await db.muddakirDay.upsert({
    where: { studentId_dayDate: { studentId, dayDate: dateVal(dayDate) } },
    update: {
      status, newFromPage: newFrom, newToPage: newTo,
      ribatDone: fold.ribatDone, reviewDone: fold.reviewDone,
      excuseReason: fold.excuseReason, completedAt: fold.completedAt,
      makeupForDayId: makeupDayId,
    },
    create: {
      studentId, dayDate: dateVal(dayDate), status, newFromPage: newFrom, newToPage: newTo,
      ribatDone: fold.ribatDone, reviewDone: fold.reviewDone,
      excuseReason: fold.excuseReason, completedAt: fold.completedAt, makeupForDayId: makeupDayId,
    },
  });

  // DayFace لكل صفحةٍ لُمست (upsert — إسقاطٌ يُعاد حسابه، بلا حذف).
  for (const [page, c] of fold.faces) {
    await db.muddakirDayFace.upsert({
      where: { dayId_page: { dayId: day.id, page } },
      update: { reps: c.reps, repErrors: c.repErrors, yesterdayReps: c.yesterdayReps },
      create: { dayId: day.id, page, reps: c.reps, repErrors: c.repErrors, yesterdayReps: c.yesterdayReps },
    });
  }

  await advanceFaceStates(db, studentId, dayDate, fold, settings);
}

/** ترقية أوجه الحفظ الجديد: NEW → IN_RIBAT عند بلوغ التكرار (§٤٫٢)، وضبط firstMemorizedOn (أدنى يوم). */
async function advanceFaceStates(db: Db, studentId: string, dayDate: string, fold: DayFold, settings: DayEngineSettings): Promise<void> {
  const memorized = [...fold.faces.entries()].filter(([, c]) => c.reps >= settings.newReps).map(([p]) => p);
  for (const page of fold.newPages) {
    const reps = fold.faces.get(page)?.reps ?? 0;
    const isMem = reps >= settings.newReps;
    await db.muddakirFace.upsert({
      where: { studentId_page: { studentId, page } },
      update: {}, // الحالة تُرقّى بتحديثاتٍ مشروطةٍ أدناه، لا هنا
      create: { studentId, page, state: isMem ? MuddakirFaceState.IN_RIBAT : MuddakirFaceState.NEW, firstMemorizedOn: isMem ? dateVal(dayDate) : null },
    });
  }
  if (memorized.length) {
    // NEW ⟵ IN_RIBAT (لا يُرجِع HEARD/IN_REVIEW)، وضبط أوّل يوم حفظٍ إن غاب.
    await db.muddakirFace.updateMany({
      where: { studentId, page: { in: memorized }, state: MuddakirFaceState.NEW },
      data: { state: MuddakirFaceState.IN_RIBAT, firstMemorizedOn: dateVal(dayDate) },
    });
    // إن اشتُقّ يومٌ أبكر لاحقًا: خَفِّض firstMemorizedOn إلى الأبكر.
    await db.muddakirFace.updateMany({
      where: { studentId, page: { in: memorized }, firstMemorizedOn: { gt: dateVal(dayDate) } },
      data: { firstMemorizedOn: dateVal(dayDate) },
    });
    // repErrors التراكميّ (مؤشّر المشرف) = مجموع أخطاء اليوميّات لكل صفحة — يُعاد حسابه (idempotent).
    const dayIds = (await db.muddakirDay.findMany({ where: { studentId }, select: { id: true } })).map((d) => d.id);
    const sums = await db.muddakirDayFace.groupBy({ by: ["page"], where: { dayId: { in: dayIds }, page: { in: memorized } }, _sum: { repErrors: true } });
    for (const s of sums) {
      await db.muddakirFace.updateMany({ where: { studentId, page: s.page }, data: { repErrors: s._sum.repErrors ?? 0 } });
    }
  }
}

/** حالة يومٍ محسوبةٌ كسولًا الآن (تقرأ الأحداث والقضاء بتوقيت مكّة). */
export async function getDayStatus(db: Db, studentId: string, dayDate: string, now: Date = new Date()): Promise<MuddakirDayStatus> {
  const day = await db.muddakirDay.findUnique({ where: { studentId_dayDate: { studentId, dayDate: dateVal(dayDate) } } });
  const evs = await db.muddakirEvent.findMany({ where: { studentId, dayDate: dateVal(dayDate) }, select: { type: true, payload: true } });
  const excused = evs.some((e) => e.type === "EXCUSE");
  const isMakeup = evs.some((e) => e.type === "MAKEUP_COMPLETE");
  const completedAt = day?.completedAt ?? null;
  const { madeUpOn } = isMakeup ? { madeUpOn: null } : await makeupInfo(db, studentId, dayDate);
  return computeDayStatus({ dayDate, completedAt, excused, isMakeup, madeUpOn, now });
}

/**
 * ترقية HEARD → IN_REVIEW (§٤٫٢/§٤٫٣): لا يخرج الوجه من الربط إلا بعد أن يسمعه المشرف، فقط الأوجه
 * المسموعة التي تجاوزت نافذة مسارها تدخل المراجعة. (الأوجه IN_RIBAT غير المسموعة تبقى ربطًا دائمًا.)
 */
export async function transitionReviewStates(db: Db, studentId: string, today: string, track: number, settings: DayEngineSettings): Promise<number> {
  const windowDays = settings.ribatWindowDays[String(track)];
  if (windowDays == null) return 0;
  const heard = await db.muddakirFace.findMany({ where: { studentId, state: MuddakirFaceState.HEARD }, select: { page: true, firstMemorizedOn: true } });
  const due = heard.filter((f) => f.firstMemorizedOn && Math.round((dateVal(today).getTime() - f.firstMemorizedOn.getTime()) / MS_DAY) > windowDays).map((f) => f.page);
  if (!due.length) return 0;
  const r = await db.muddakirFace.updateMany({
    where: { studentId, page: { in: due }, state: MuddakirFaceState.HEARD },
    data: { state: MuddakirFaceState.IN_REVIEW, reviewEnteredOn: dateVal(today) },
  });
  return r.count;
}

/** يسمّع المشرف وجهًا: IN_RIBAT → HEARD (زرّه في المرحلة ٦؛ هنا دالّةٌ فقط). لا يتخطّى الحالة. */
export async function markFaceHeard(db: Db, studentId: string, page: number, heardById: string, at: Date = new Date()): Promise<boolean> {
  const r = await db.muddakirFace.updateMany({
    where: { studentId, page, state: MuddakirFaceState.IN_RIBAT },
    data: { state: MuddakirFaceState.HEARD, heardAt: at, heardById },
  });
  return r.count === 1;
}

// ── خطّة اليوم (§٣ ترتيب الأركان) ──
export interface TodayPlan {
  dayDate: string;
  reviewOnly: boolean;
  excused: boolean;
  yesterday: number[];
  newFaces: number[];
  ribat: number[];
  reviewSlice: number[];
  openTreatments: { page: number; lineNo: number; source: string }[];
  makeup: { forDate: string; newFromPage: number | null; newToPage: number | null; ribatDone: boolean; reviewDone: boolean } | null;
}

/**
 * خطّة يوم الحافظ: تكرار الأمس، الجديد بحسب المسار، نطاق الربط، شريحة المراجعة، مواضع العلاج
 * المفتوحة، وقضاء الأمس إن وُجد. تُعيد اشتقاق اليوم أوّلًا، وتستعمل دوالّ src/lib/muddakir.
 */
export async function todayPlan(studentId: string, today: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<TodayPlan> {
  await deriveDay(db, studentId, today, now);
  const profile = await db.muddakirProfile.findUnique({ where: { studentId } });
  if (!profile) throw new Error("لا ملفّ مُدَّكِرٍ للحافظ.");
  const settings = await loadDayEngineSettings(db);
  await transitionReviewStates(db, studentId, today, profile.track, settings);

  const faces = await db.muddakirFace.findMany({ where: { studentId } });
  const todayRow = await db.muddakirDay.findUnique({ where: { studentId_dayDate: { studentId, dayDate: dateVal(today) } } });
  const excused = todayRow?.excuseReason != null;
  const reviewOnly = profile.mode === "REVIEW_ONLY";

  // تكرار الأمس: أوجهٌ حُفظت أمس (firstMemorizedOn = اليوم − ١).
  const yDay = dayShift(today, -1);
  const yesterday = faces.filter((f) => f.firstMemorizedOn && isoOf(f.firstMemorizedOn) === yDay).map((f) => f.page).sort((a, b) => a - b);

  // الجديد بحسب المسار (يتوقّف بالعذر أو وضع المراجعة فقط).
  let newFaces: number[] = [];
  if (!excused && !reviewOnly) {
    const mushaf = (await db.mushafFace.findMany({ select: { page: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true } })) as MushafFaceData[];
    const lastMemorized = faces.filter((f) => f.state !== MuddakirFaceState.NEW).reduce((m, f) => Math.max(m, f.page), 0);
    newFaces = newFacesForDay(lastMemorized, profile.track, mushaf);
  }

  // الربط (بترتيب المصحف) — دالّة المرحلة ٢.
  const faceInputs: FaceStateInput[] = faces.map((f) => ({
    page: f.page,
    state: f.state as FaceStateInput["state"],
    firstMemorizedOn: f.firstMemorizedOn ? isoOf(f.firstMemorizedOn) : null,
    heard: f.state === MuddakirFaceState.HEARD || f.state === MuddakirFaceState.IN_REVIEW || f.heardAt != null,
  }));
  const ribat = ribatWindow({ track: profile.track, reviewCycleDays: profile.reviewCycleDays }, faceInputs, today, settings.ribatWindowDays).map((f) => f.page);

  // شريحة المراجعة (ختمة الدورة) — دالّة المرحلة ٢.
  const reviewFaces = faces.filter((f) => f.state === MuddakirFaceState.IN_REVIEW).map((f) => ({ page: f.page }));
  const reviewSlice = reviewSliceForDay(reviewFaces, profile.reviewCycleDays, today).map((f) => f.page);

  // مواضع العلاج المفتوحة (تُفتَح في مراحل لاحقة؛ هنا قراءةٌ فقط).
  const openTreatments = (await db.muddakirError.findMany({ where: { studentId, resolvedAt: null }, select: { page: true, lineNo: true, source: true }, orderBy: [{ page: "asc" }, { lineNo: "asc" }] }))
    .map((e) => ({ page: e.page, lineNo: e.lineNo, source: e.source }));

  // قضاء الأمس إن كان أمسُ معلّقًا.
  let makeup: TodayPlan["makeup"] = null;
  const yStatus = await getDayStatus(db, studentId, yDay, now);
  if (yStatus === MuddakirDayStatus.PENDING_MAKEUP) {
    const yRow = await db.muddakirDay.findUnique({ where: { studentId_dayDate: { studentId, dayDate: dateVal(yDay) } } });
    makeup = { forDate: yDay, newFromPage: yRow?.newFromPage ?? null, newToPage: yRow?.newToPage ?? null, ribatDone: yRow?.ribatDone ?? false, reviewDone: yRow?.reviewDone ?? false };
  }

  return { dayDate: today, reviewOnly, excused, yesterday, newFaces, ribat, reviewSlice, openTreatments, makeup };
}

export const _test = { dateVal, isoOf, dayShift, foldDay };
