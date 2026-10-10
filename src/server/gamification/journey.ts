import { BadgeConditionKind, ProgramKey, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { makkahDayDate } from "@/lib/muddakir";
import { getBalance, getStudentLedger } from "@/server/economy";
import { gamificationAr } from "@/i18n/ar/gamification";
import { listBadgeDefinitions, listStudentBadges, type EarnedBadge } from "./badges";
import { evaluateBadges } from "./evaluator";
import { roadmapsForStudent, type Roadmap } from "./roadmap";
import { studentDayMarks } from "./day-marks";
import { computeStreak } from "./streak";
import { buildMotivations, type Motivation } from "./motivation";
import { activeTemplatesMap } from "./admin";

// ═══════════════ تجميع صفحة رحلة الطالب (ل٥، §٦) ═══════════════
//
// يُقيّم الأوسمة بكسلٍ عند العرض (idempotent)، ثمّ يجمع: السلسلة، النقاط (الحصاد القائم)، خرائط
// البرامج، الأوسمة (المكتسبة والقادمة)، ورسائل التحفيز. null إن لم يكن صاحب الحساب طالباً.

export interface UpcomingBadge { code: string; nameAr: string; descAr: string; emoji: string | null; category: string }
export interface JourneyView {
  streak: { current: number; longest: number };
  points: { balance: number; week: number; last: { itemName: string; amount: number; at: string } | null };
  roadmaps: Roadmap[];
  badges: { earned: EarnedBadge[]; upcoming: UpcomingBadge[] };
  motivations: Motivation[];
  justAwarded: string[]; // رموز الأوسمة الممنوحة في هذا العرض (لحظة الاحتفاء)
}

/** ملخّصٌ خفيفٌ للتلعيب (للـPWA في المدّكر): يدخل ردّ /today فيُخزَّن ويظهر بلا إنترنت. */
export interface GamiSummary { streakCurrent: number; streakLongest: number; badgeCount: number; latestBadge: { nameAr: string; emoji: string | null } | null }
export async function gamiSummary(studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<GamiSummary> {
  const [streak, earned] = await Promise.all([
    computeStreak(await studentDayMarks(studentId, db, now)),
    listStudentBadges(studentId, db),
  ]);
  return { streakCurrent: streak.current, streakLongest: streak.longest, badgeCount: earned.length, latestBadge: earned[0] ? { nameAr: earned[0].nameAr, emoji: earned[0].emoji } : null };
}

export async function getMyJourney(userId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<JourneyView | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { student: { select: { id: true } } } });
  const studentId = user?.student?.id;
  if (!studentId) return null;

  const justAwarded = await evaluateBadges(db, studentId, now); // منحٌ كسولٌ idempotent

  const today = makkahDayDate(now);
  const marks = await studentDayMarks(studentId, db, now);
  const streak = computeStreak(marks);
  const doneToday = marks.find((m) => m.date === today)?.status === "COMPLETE";

  // النقاط: الرصيد، ونقاط الأسبوع، وآخر ما كُسب (من الحصاد القائم).
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [balance, ledger, weekAgg] = await Promise.all([
    getBalance(studentId, db),
    getStudentLedger(studentId, db, 1),
    db.pointTransaction.aggregate({ where: { studentId, createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
  ]);
  const lastTx = ledger.transactions[0];
  const points = {
    balance,
    week: weekAgg._sum.amount ?? 0,
    last: lastTx ? { itemName: lastTx.itemName, amount: lastTx.amount, at: lastTx.createdAt.toISOString() } : null,
  };

  // الخرائط (+ WEEKLY قيد الإعداد إن كان ملتحقاً به).
  const roadmaps = await roadmapsForStudent(studentId, db);
  const weekly = await db.enrollment.findFirst({ where: { studentId, endedAt: null, program: { key: ProgramKey.WEEKLY } }, select: { id: true } });
  if (weekly) roadmaps.push({ programKey: ProgramKey.WEEKLY, stations: [{ key: "soon", label: gamificationAr.comingSoon, state: "CURRENT" }], currentKey: "soon" });

  // الأوسمة: المكتسبة + القادمة (المفعّلة غير المكتسبة).
  const earned = await listStudentBadges(studentId, db);
  const earnedCodes = new Set(earned.map((b) => b.code));
  const defs = await listBadgeDefinitions(db, { activeOnly: true });
  const upcoming: UpcomingBadge[] = defs
    .filter((d) => !earnedCodes.has(d.code))
    .map((d) => ({ code: d.code, nameAr: d.nameAr, descAr: d.descAr, emoji: d.emoji, category: d.category }));

  // رسائل التحفيز: أقرب وسام سلسلةٍ قادم + تقدّم المحطّة الحاليّة لأبرز برنامج.
  const streakDefs = defs
    .filter((d) => d.kind === BadgeConditionKind.STREAK_DAYS && d.threshold != null && d.threshold > streak.current && !earnedCodes.has(d.code))
    .sort((a, b) => (a.threshold! - b.threshold!));
  const nearestBadge = streakDefs.length ? { remaining: streakDefs[0].threshold! - streak.current, nameAr: streakDefs[0].nameAr } : null;
  const curStation = roadmaps.flatMap((r) => r.stations).find((s) => s.state === "CURRENT" && s.progress);
  const currentStation = curStation?.progress ? { done: curStation.progress.done, total: curStation.progress.total, label: curStation.label } : null;
  const templates = await activeTemplatesMap(db);
  const motivations = buildMotivations({ streakCurrent: streak.current, doneToday, nearestBadge, currentStation }, templates);

  return { streak, points, roadmaps, badges: { earned, upcoming }, motivations, justAwarded };
}
