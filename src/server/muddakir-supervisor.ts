import {
  AutoEventType,
  MuddakirDayStatus,
  MuddakirErrorSource,
  MuddakirFaceState,
  PointGrantSource,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { juzBoundsFromHizb, makkahDayBounds, makkahDayDate, type HizbRow } from "@/lib/muddakir";

import { emitEvent } from "./events";
import { grantAuto } from "./economy";
import { AuthorizationError, ValidationError } from "./errors";
import { getProgramSetting } from "./settings";
import { muddakirProgramId } from "./muddakir-profile";
import {
  applyDueTrackChange,
  dateVal,
  dayShift,
  getDayStatus,
  isoOf,
  latestTrackRequest,
  loadDayEngineSettings,
  markFaceHeard,
  transitionReviewStates,
} from "./muddakir-day";
import { getStageProgress, type StageProgress } from "./muddakir-stages";
import { getWardView, raiseDegree as wardRaiseDegree, type RaiseResult } from "./muddakir-ward";

// ═══════════════ المُدَّكِر — المشرف واللقاء الأسبوعيّ (المرحلة ٦) ═══════════════
//
// §٦: يفتح المشرف حافظاً فيرى أوجه أسبوعه، يعلّمها «سُمِع» (HEARD ثمّ IN_REVIEW إن تجاوزت نافذة
// الربط)، يسجّل مواضع الأخطاء بمصدر SUPERVISOR، ثمّ يؤكّد انتظام الأسبوع فتُصدَر النقاط المعلّقة
// (§٧) دفعةً واحدة عبر AutoGrant القائم (لا منح يوميّ). ويُقرّ تغيير المسار ويعدّل دورة المراجعة.
//
// الصلاحيّة (§٢، §٦): المشرف يرى حفّاظه المُسندين فقط ويكتب لهم فقط؛ المدير يرى الجميع ويكتب لهم.

type Db = PrismaClient | Prisma.TransactionClient;

const MANAGE_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];
const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

const dowOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();
const monthStart = (iso: string): string => `${iso.slice(0, 7)}-01`;

// ── الصلاحيّة ──

function isManager(roles: readonly Role[]): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}

/** هل يرى المستخدم شاشة المشرف أصلاً؟ مشرفٌ (ARIF) أو مديرٌ. */
export function canViewSupervisor(roles: readonly Role[]): boolean {
  return isManager(roles) || roles.includes(Role.ARIF);
}

/** المدير يكتب للجميع؛ المشرف لحفّاظه المُسندين فقط (قيد MuddakirSupervision النشط). وإلّا يُرفض. */
async function assertCanActOnHafiz(db: Db, actorUserId: string, studentId: string): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: actorUserId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (isManager(actor.roles)) return;
  if (!actor.roles.includes(Role.ARIF)) throw new AuthorizationError("هذه الشاشة للمشرف.");
  const link = await db.muddakirSupervision.findFirst({
    where: { supervisorId: actorUserId, studentId, endedAt: null },
    select: { id: true },
  });
  if (!link) throw new AuthorizationError("لا تشرف على هذا الحافظ.");
}

/** معرّفات حفّاظ الفاعل: المدير ⟵ كلّ ملفّات المُدَّكِر؛ المشرف ⟵ إسناداته النشطة فقط. */
async function hafizIdsFor(db: Db, actorUserId: string): Promise<{ ids: string[]; manager: boolean }> {
  const actor = await db.user.findUnique({ where: { id: actorUserId }, select: { roles: true } });
  if (!actor || !canViewSupervisor(actor.roles)) throw new AuthorizationError("غير مصرَّح بعرض المُدَّكِر.");
  if (isManager(actor.roles)) {
    const profiles = await db.muddakirProfile.findMany({ select: { studentId: true } });
    return { ids: profiles.map((p) => p.studentId), manager: true };
  }
  const sups = await db.muddakirSupervision.findMany({ where: { supervisorId: actorUserId, endedAt: null }, select: { studentId: true } });
  return { ids: sups.map((s) => s.studentId), manager: false };
}

// ── نافذة اللقاء الأسبوعيّ (§٦): الأسبوع ينتهي بآخر يوم لقاءٍ ≤ اليوم، ويمتدّ ٧ أيّام إلى الوراء ──

/** نافذة الأسبوع بتوقيت مكّة: weekEnd = آخر يوم لقاءٍ ≤ اليوم، وweekStart = قبله بستّة أيّام. */
export function meetingWeek(now: Date, meetingDay: string): { weekStart: string; weekEnd: string } {
  const today = makkahDayDate(now);
  const target = Math.max(0, WEEKDAYS.indexOf(meetingDay as (typeof WEEKDAYS)[number]));
  const back = (dowOf(today) - target + 7) % 7;
  const weekEnd = dayShift(today, -back);
  return { weekStart: dayShift(weekEnd, -6), weekEnd };
}

async function meetingDayOf(db: Db, programId: string): Promise<string> {
  const v = await getProgramSetting(programId, "meetingDay", db as PrismaClient);
  return typeof v === "string" ? v : "WEDNESDAY";
}

async function allowedTracks(db: Db, programId: string): Promise<number[]> {
  const v = await getProgramSetting(programId, "tracks", db as PrismaClient);
  return Array.isArray(v) ? (v.filter((x): x is number => typeof x === "number")) : [1, 2, 3];
}

// ═══════════════ القراءات ═══════════════

export interface HafizIndicators {
  studentId: string;
  name: string;
  stage: number;
  track: number;
  shortfallDays: number;        // أيّام التقصير (SHORTFALL)
  makeupPending: number;        // أيّام القضاء المعلّقة الآن (PENDING_MAKEUP)
  excusesThisMonth: number;     // الأعذار هذا الشهر
  excuseLimit: number | null;   // الحدّ الشهريّ (null = بلا حدّ)
  excuseLimitExceeded: boolean; // تنبيهٌ إن تجاوز الحدّ
  repErrors: number;            // مجموع أخطاء التكرار (مؤشّر قوّة)
  weakFaces: number;            // عدد الأوجه الموسومة ضعيفة
  openTreatments: number;       // مواضع العلاج المفتوحة
  trackRequestPending: boolean; // طلب الحافظ تغيير المسار معلّقٌ للإقرار
}

async function indicatorsFor(db: Db, studentId: string, name: string, now: Date, excuseLimit: number | null): Promise<HafizIndicators> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId } });
  const today = makkahDayDate(now);
  const [days, faceAgg, weakFaces, openTreatments, excuseRows, req] = await Promise.all([
    db.muddakirDay.groupBy({ by: ["status"], where: { studentId }, _count: { _all: true } }),
    db.muddakirFace.aggregate({ where: { studentId }, _sum: { repErrors: true } }),
    db.muddakirFace.count({ where: { studentId, weak: true } }),
    db.muddakirError.count({ where: { studentId, resolvedAt: null } }),
    db.muddakirDay.count({ where: { studentId, excuseReason: { not: null }, dayDate: { gte: dateVal(monthStart(today)) } } }),
    latestTrackRequest(db, studentId),
  ]);
  const countOf = (st: MuddakirDayStatus) => days.find((d) => d.status === st)?._count._all ?? 0;
  const trackRequestPending = req != null && req.track !== profile?.track && req.track !== (profile?.pendingTrack ?? undefined);
  return {
    studentId,
    name,
    stage: Number(profile?.currentStageId ?? "1") || 1,
    track: profile?.track ?? 1,
    shortfallDays: countOf(MuddakirDayStatus.SHORTFALL),
    makeupPending: countOf(MuddakirDayStatus.PENDING_MAKEUP),
    excusesThisMonth: excuseRows,
    excuseLimit,
    excuseLimitExceeded: excuseLimit != null && excuseRows > excuseLimit,
    repErrors: faceAgg._sum.repErrors ?? 0,
    weakFaces,
    openTreatments,
    trackRequestPending,
  };
}

async function namesOf(db: Db, studentIds: string[]): Promise<Map<string, string>> {
  if (!studentIds.length) return new Map();
  const rows = await db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, user: { select: { nameAsInId: true } } } });
  return new Map(rows.map((r) => [r.id, r.user.nameAsInId]));
}

export interface SupervisorDashboard { canManageAll: boolean; hafiz: HafizIndicators[] }

/** لوحة المشرف (§٦، بند ١): حفّاظه ومؤشّرات كلٍّ. المدير يرى الجميع. */
export async function supervisorDashboard(actorUserId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<SupervisorDashboard> {
  const { ids, manager } = await hafizIdsFor(db, actorUserId);
  const programId = await muddakirProgramId(db);
  const limitSetting = await getProgramSetting(programId, "monthlyExcuseLimit", db);
  const excuseLimit = typeof limitSetting === "number" && limitSetting > 0 ? limitSetting : null;
  const names = await namesOf(db, ids);
  const hafiz = await Promise.all(ids.map((id) => indicatorsFor(db, id, names.get(id) ?? "—", now, excuseLimit)));
  hafiz.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  return { canManageAll: manager, hafiz };
}

export interface HafizDetail {
  studentId: string;
  name: string;
  track: number;
  pendingTrack: number | null;
  effectiveFrom: string | null;
  reviewCycleDays: number;
  tracks: number[];
  week: { weekStart: string; weekEnd: string; meetingDay: string; confirmed: boolean; heardCount: number };
  facesToHear: { page: number; weak: boolean }[];   // أوجه الربط التي لم تُسمَع بعد (الضعيف أوّلاً)
  heardThisWeek: number[];                            // أوجهٌ سُمِعت في نافذة الأسبوع
  openTreatments: { page: number; lineNo: number; source: string }[];
  trackRequest: { track: number } | null;            // طلبٌ معلّقٌ للإقرار
  stageProgress: StageProgress | null;                // ختام المرحلة (§٧): جاهزيّة السرد والوضع (null إن لم تُبذر بيانات المصحف)
  tathbit: TathbitSupervisorView | null;              // التثبيت (§١٢): الدرجة والمواضع المفاجئة (للمشرف فقط، تعديل ٣)
  indicators: HafizIndicators;
}

/** عرض التثبيت للمشرف — يتضمّن المواضع المفاجئة (لا تصل الحافظ أبداً، تعديل ٣). */
export interface TathbitSupervisorView {
  phase: "TATHBIT" | "PERMANENT";
  degreeNo: number;
  dailyJuz: number;
  khatmaInDegree: number;
  cumulativeKhatmat: number;
  finishedLadder: boolean;
  surprisePositions: { juz: number; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }[];
}

/** تفصيل حافظٍ للقاء الأسبوعيّ (§٦، بند ٢): أوجه أسبوعه، مواضع العلاج، حالة الأسبوع وطلب المسار. */
export async function supervisorHafizDetail(actorUserId: string, studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<HafizDetail> {
  await assertCanActOnHafiz(db, actorUserId, studentId);
  await applyDueTrackChange(db, studentId, makkahDayDate(now));
  const profile = await db.muddakirProfile.findUnique({ where: { studentId } });
  if (!profile) throw new ValidationError("الحافظ غير ملتحقٍ بالمُدَّكِر.");
  const programId = await muddakirProgramId(db);
  const meetingDay = await meetingDayOf(db, programId);
  const { weekStart, weekEnd } = meetingWeek(now, meetingDay);
  const startB = makkahDayBounds(weekStart).start;
  const endB = makkahDayBounds(weekEnd).end;

  const [name, inRibat, heard, treatments, week, req, tracks, excuseLimitSetting] = await Promise.all([
    namesOf(db, [studentId]).then((m) => m.get(studentId) ?? "—"),
    db.muddakirFace.findMany({ where: { studentId, state: MuddakirFaceState.IN_RIBAT }, select: { page: true, weak: true } }),
    db.muddakirFace.findMany({ where: { studentId, heardAt: { gte: startB, lt: endB } }, select: { page: true } }),
    db.muddakirError.findMany({ where: { studentId, resolvedAt: null }, select: { page: true, lineNo: true, source: true }, orderBy: [{ page: "asc" }, { lineNo: "asc" }] }),
    db.muddakirWeek.findUnique({ where: { studentId_weekStart: { studentId, weekStart: dateVal(weekStart) } } }),
    latestTrackRequest(db, studentId),
    allowedTracks(db, programId),
    getProgramSetting(programId, "monthlyExcuseLimit", db),
  ]);

  const excuseLimit = typeof excuseLimitSetting === "number" && excuseLimitSetting > 0 ? excuseLimitSetting : null;
  const indicators = await indicatorsFor(db, studentId, name, now, excuseLimit);
  let stageProgress: StageProgress | null = null;
  try { stageProgress = await getStageProgress(studentId, db); } catch { /* بيانات المصحف/الأحزاب غير مبذورة */ }
  const tathbit = await tathbitSupervisorView(db, studentId, weekStart, now);
  const pending = req != null && req.track !== profile.track && req.track !== (profile.pendingTrack ?? undefined);

  return {
    studentId,
    name,
    track: profile.track,
    pendingTrack: profile.pendingTrack,
    effectiveFrom: profile.effectiveFrom ? isoOf(profile.effectiveFrom) : null,
    reviewCycleDays: profile.reviewCycleDays,
    tracks,
    week: { weekStart, weekEnd, meetingDay, confirmed: week?.regularityConfirmedAt != null, heardCount: week?.heardCount ?? 0 },
    facesToHear: inRibat.sort((a, b) => Number(b.weak) - Number(a.weak) || a.page - b.page),
    heardThisWeek: heard.map((f) => f.page).sort((a, b) => a - b),
    openTreatments: treatments,
    trackRequest: pending ? { track: req!.track } : null,
    stageProgress,
    tathbit,
    indicators,
  };
}

// ── التثبيت: عرض المشرف ومواضعه المفاجئة (لا تصل الحافظ، تعديل ٣) ──

/** تبعثرٌ حتميّ (مزيجُ معرّف الحافظ + الأسبوع) — ثابتٌ للأسبوع فلا تتغيّر المواضع عند كلّ فتح. */
function seededOrder(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const idx = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) { h = (Math.imul(h, 48271) + 1) >>> 0; const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

async function tathbitSupervisorView(db: Db, studentId: string, weekStart: string, now: Date): Promise<TathbitSupervisorView | null> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true } });
  if (!profile || profile.phase === "MEMORIZE") return null;
  const v = await getWardView(studentId, db as PrismaClient, now);
  if (!v.active && !v.finishedLadder) return null;

  // مواضع مفاجئة بقدر weeklySurpriseJuz جزءاً من ورد الأسبوع (عشوائيّةٌ ثابتةٌ للأسبوع، يغيّرها المشرف).
  const programId = await muddakirProgramId(db);
  const surpriseSetting = await getProgramSetting(programId, "weeklySurpriseJuz", db as PrismaClient);
  const count = typeof surpriseSetting === "number" && surpriseSetting > 0 ? surpriseSetting : 1;
  const hizb = (await db.hizbBoundary.findMany()) as unknown as HizbRow[];
  const juz = hizb.length ? juzBoundsFromHizb(hizb) : [];
  const order = seededOrder(`${studentId}:${weekStart}`, 30);
  const picked = order.slice(0, Math.min(count, 30)).sort((a, b) => a - b);
  const surprisePositions = picked
    .map((j) => juz.find((x) => x.juz === j))
    .filter((x): x is NonNullable<typeof x> => x != null)
    .map((x) => ({ juz: x.juz, fromSurah: x.startSurah, fromAyah: x.startAyah, toSurah: x.endSurah, toAyah: x.endAyah }));

  return {
    phase: v.phase === "PERMANENT" ? "PERMANENT" : "TATHBIT",
    degreeNo: v.degreeNo, dailyJuz: v.dailyJuz, khatmaInDegree: v.khatmaInDegree,
    cumulativeKhatmat: v.cumulativeKhatmat, finishedLadder: v.finishedLadder, surprisePositions,
  };
}

/** الرفع المبكّر: المشرف/المدير يرفع حافظه المُسنَد إلى الدرجة التالية (§١٢) — مع تسجيلٍ، لا نزول. */
export async function raiseHafizDegree(args: { actorUserId: string; studentId: string }, db: PrismaClient = prisma, now: Date = new Date()): Promise<RaiseResult> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  return wardRaiseDegree(args.studentId, args.actorUserId, db, now);
}

// ═══════════════ الكتابات ═══════════════

/** يسمّع المشرف وجهاً (§٤٫٢/§٦): IN_RIBAT → HEARD، ثمّ IN_REVIEW إن تجاوز نافذة الربط. */
export async function markHeard(args: { actorUserId: string; studentId: string; page: number }, db: PrismaClient = prisma, now: Date = new Date()): Promise<{ heard: boolean }> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  const ok = await markFaceHeard(db, args.studentId, args.page, args.actorUserId, now);
  if (ok) {
    const profile = await db.muddakirProfile.findUnique({ where: { studentId: args.studentId }, select: { track: true } });
    const settings = await loadDayEngineSettings(db);
    await transitionReviewStates(db, args.studentId, makkahDayDate(now), profile?.track ?? 1, settings);
  }
  return { heard: ok };
}

/** يسجّل المشرف موضع خطأٍ (§٤٫٤/§٦): الصفحة + السطر من MushafLine، مصدره SUPERVISOR. idempotent. */
export async function recordSupervisorError(args: { actorUserId: string; studentId: string; page: number; lineNo: number }, db: PrismaClient = prisma, now: Date = new Date()): Promise<{ recorded: boolean }> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  if (!Number.isInteger(args.page) || !Number.isInteger(args.lineNo)) throw new ValidationError("موضعٌ غير صالح.");
  const line = await db.mushafLine.findUnique({ where: { page_lineNo: { page: args.page, lineNo: args.lineNo } }, select: { page: true } });
  if (!line) throw new ValidationError("موضعٌ غير موجودٍ في المصحف.");
  const exists = await db.muddakirError.findFirst({ where: { studentId: args.studentId, page: args.page, lineNo: args.lineNo, resolvedAt: null }, select: { id: true } });
  if (!exists) {
    await db.muddakirError.create({ data: { studentId: args.studentId, page: args.page, lineNo: args.lineNo, source: MuddakirErrorSource.SUPERVISOR, openedOn: dateVal(makkahDayDate(now)), recordedById: args.actorUserId } });
  }
  return { recorded: true };
}

/**
 * يُقرّ المشرف تغيير المسار (§٤٫١/§٦): يضبط pendingTrack بالمسار المطلوب (الممرَّر أو آخر طلبٍ من
 * الحافظ) وeffectiveFrom = الغد بتوقيت مكّة، فيُطبَّق من يومه (applyDueTrackChange).
 */
export async function approveTrackChange(args: { actorUserId: string; studentId: string; track?: number }, db: PrismaClient = prisma, now: Date = new Date()): Promise<{ pendingTrack: number; effectiveFrom: string }> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  const programId = await muddakirProgramId(db);
  let track = args.track;
  if (track == null) track = (await latestTrackRequest(db, args.studentId))?.track;
  if (track == null) throw new ValidationError("لا طلب تغيير مسارٍ من الحافظ.");
  const tracks = await allowedTracks(db, programId);
  if (!tracks.includes(track)) throw new ValidationError("مسارٌ غير مسموح.");
  const effectiveFrom = dayShift(makkahDayDate(now), 1); // الغد بتوقيت مكّة
  await db.muddakirProfile.update({ where: { studentId: args.studentId }, data: { pendingTrack: track, effectiveFrom: dateVal(effectiveFrom) } });
  return { pendingTrack: track, effectiveFrom };
}

/** يعدّل المشرف دورة المراجعة لحافظه (§٤٫٣/§٦) — عددٌ موجب. */
export async function setReviewCycleDays(args: { actorUserId: string; studentId: string; days: number }, db: PrismaClient = prisma): Promise<{ reviewCycleDays: number }> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  if (!Number.isInteger(args.days) || args.days < 1) throw new ValidationError("دورة المراجعة عددٌ صحيحٌ موجب.");
  await db.muddakirProfile.update({ where: { studentId: args.studentId }, data: { reviewCycleDays: args.days } });
  return { reviewCycleDays: args.days };
}

// ═══════════════ تأكيد انتظام الأسبوع وإصدار النقاط المعلّقة (§٦ بند ٣، §٧) ═══════════════

/** معرّف أسبوع الحافظ (MuddakirWeek) للنافذة الحاليّة — يُنشأ عند اللزوم. */
async function ensureWeek(db: Db, studentId: string, weekStart: string): Promise<string> {
  const w = await db.muddakirWeek.upsert({
    where: { studentId_weekStart: { studentId, weekStart: dateVal(weekStart) } },
    update: {},
    create: { studentId, weekStart: dateVal(weekStart) },
  });
  return w.id;
}

export interface ConfirmWeekResult { weekId: string; heardCount: number; grantedDays: number; shortfallDays: number; stageCompletions: number }

/**
 * يؤكّد المشرف انتظام الأسبوع (§٦ بند ٣): يُصدِر النقاط المعلّقة (§٧) **دفعةً واحدة** عبر AutoGrant
 * القائم (لا منح يوميّ) — إتمام الأيّام (MADE_UP مُتمّ)، والأوجه المسموعة، وخصم SHORTFALL — بقيم
 * PointItem من الإدارة؛ إن لم يُعرَّف البند فلا منح بلا خطأ. sourceRef = معرّف الأسبوع + الحدث، فلا
 * يكرّر التأكيدُ الثاني المنحَ (قيد AutoGrant الفريد). أيّ تعديلٍ لاحقٍ يُعكَس بقيدٍ معاكس
 * (reverseWeekGrants، النمط القائم).
 */
export async function confirmWeekRegularity(args: { actorUserId: string; studentId: string }, db: PrismaClient = prisma, now: Date = new Date()): Promise<ConfirmWeekResult> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  const programId = await muddakirProgramId(db);
  const meetingDay = await meetingDayOf(db, programId);
  const { weekStart } = meetingWeek(now, meetingDay);
  const startB = makkahDayBounds(weekStart).start;
  const endB = makkahDayBounds(dayShift(weekStart, 6)).end;

  return db.$transaction(async (tx) => {
    const weekId = await ensureWeek(tx, args.studentId, weekStart);

    // الأوجه المسموعة في نافذة الأسبوع — منحٌ لكلّ وجهٍ (sourceRef = الأسبوع + الوجه).
    const heard = await tx.muddakirFace.findMany({ where: { studentId: args.studentId, heardAt: { gte: startB, lt: endB } }, select: { page: true } });
    for (const f of heard) await grantAuto(tx, AutoEventType.MUDDAKIR_FACE_HEARD, args.studentId, `${weekId}:face:${f.page}`);

    // الأيّام السبعة: إتمامٌ (COMPLETE/MADE_UP) ← منح، تقصيرٌ (SHORTFALL) ← خصم. غيرها لا شيء.
    let grantedDays = 0;
    let shortfallDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = dayShift(weekStart, i);
      const status = await getDayStatus(tx, args.studentId, d, now);
      if (status === MuddakirDayStatus.COMPLETE || status === MuddakirDayStatus.MADE_UP) {
        await grantAuto(tx, AutoEventType.MUDDAKIR_DAY_COMPLETE, args.studentId, `${weekId}:day:${d}`);
        grantedDays += 1;
      } else if (status === MuddakirDayStatus.SHORTFALL) {
        await grantAuto(tx, AutoEventType.MUDDAKIR_SHORTFALL, args.studentId, `${weekId}:short:${d}`);
        shortfallDays += 1;
      }
    }

    // اجتياز سرد المرحلة/الختاميّ في نافذة الأسبوع ⟵ نقاط MUDDAKIR_STAGE_COMPLETE (§٧) دفعةً، لا فوريّاً.
    const recitations = await tx.muddakirRecitation.findMany({
      where: { studentId: args.studentId, passed: true, recitedOn: { gte: dateVal(weekStart), lte: dateVal(dayShift(weekStart, 6)) } },
      select: { id: true },
    });
    for (const r of recitations) await grantAuto(tx, AutoEventType.MUDDAKIR_STAGE_COMPLETE, args.studentId, `${weekId}:recite:${r.id}`);

    await tx.muddakirWeek.update({ where: { id: weekId }, data: { regularityConfirmedAt: now, confirmedById: args.actorUserId, heardCount: heard.length } });
    await emitEvent(tx, { type: "MUDDAKIR_WEEK_CONFIRMED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorUserId, payload: { weekId, weekStart, heardCount: heard.length } });
    return { weekId, heardCount: heard.length, grantedDays, shortfallDays, stageCompletions: recitations.length };
  });
}

/**
 * يعكس نقاط أسبوعٍ مؤكَّد بقيدٍ معاكس (النمط القائم، §٧): لكلّ منحٍ غير معكوسٍ مرجعُه هذا الأسبوع،
 * يُعلَّم معكوساً (reversedAt) ويُنشَر قيدٌ تعويضيٌّ بالقيمة المعاكسة (لا حذف)، ويُفكّ تأكيد الأسبوع.
 */
export async function reverseWeekGrants(args: { actorUserId: string; studentId: string }, db: PrismaClient = prisma, now: Date = new Date()): Promise<{ reversed: number }> {
  await assertCanActOnHafiz(db, args.actorUserId, args.studentId);
  const programId = await muddakirProgramId(db);
  const meetingDay = await meetingDayOf(db, programId);
  const { weekStart } = meetingWeek(now, meetingDay);
  const week = await db.muddakirWeek.findUnique({ where: { studentId_weekStart: { studentId: args.studentId, weekStart: dateVal(weekStart) } }, select: { id: true } });
  if (!week) return { reversed: 0 };

  return db.$transaction(async (tx) => {
    const grants = await tx.autoGrant.findMany({ where: { studentId: args.studentId, sourceRef: { startsWith: `${week.id}:` }, reversedAt: null }, select: { id: true, eventType: true, pointTransactionId: true } });
    for (const g of grants) {
      await tx.autoGrant.update({ where: { id: g.id }, data: { reversedAt: now, reversedById: args.actorUserId } });
      const orig = await tx.pointTransaction.findUnique({ where: { id: g.pointTransactionId }, select: { amount: true, pointItemId: true } });
      if (!orig || orig.amount === 0) continue;
      const comp = await tx.pointTransaction.create({
        data: { studentId: args.studentId, pointItemId: orig.pointItemId, amount: -orig.amount, grantSource: PointGrantSource.AUTO, grantedByUserId: args.actorUserId, note: `عكس تأكيد أسبوع المُدَّكِر (${g.eventType})` },
      });
      await emitEvent(tx, { type: "POINTS_REVERSED_AUTO", subjectType: "Student", subjectId: args.studentId, actorId: args.actorUserId, payload: { reversedGrantId: g.id, eventType: g.eventType, amount: -orig.amount, compensationTxnId: comp.id } });
    }
    await tx.muddakirWeek.update({ where: { id: week.id }, data: { regularityConfirmedAt: null, confirmedById: null } });
    return { reversed: grants.length };
  });
}
