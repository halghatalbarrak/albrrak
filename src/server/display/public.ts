import { DisplayScreenKind, DisplayScheduleContent, DisplaySlideKind, type DisplaySchedule, type DisplaySlide, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { splitDisplayName } from "@/lib/display-name";
import { programName } from "@/i18n/ar/gamification";
import { muddakirProgramId } from "@/server/muddakir-profile";
import { getBalance } from "@/server/economy";
import { listStudentBadges } from "@/server/gamification/badges";
import { studentDayMarks } from "@/server/gamification/day-marks";
import { computeStreak } from "@/server/gamification/streak";
import { buildMotivations } from "@/server/gamification/motivation";
import { makkahDayBounds, makkahDayDate } from "@/lib/makkah-day";
import { hhmmMakkah, resolveWindow, PRAYERS, type Prayer } from "@/lib/display-schedule";
import { resolveScreenByToken, type ResolvedScreen } from "./screens";
import { rankCircle, rankProgram, type RankRow } from "./ranking";
import { withinRateLimit } from "./rate-limit";
import { madinahPrayerMs, madinahPrayerTimesAdjusted } from "./prayer-times";
import { toScheduleDef } from "./schedules";

// ═══════════════ القراءة العامّة بالرمز (ش٢) ═══════════════
//
// للعرض فقط: لا تكشف أيّ معرّفٍ داخليّ (studentId/circleId/programId/screenId) ولا بيانةً غير معروضة.
// المسجد: ترتيب كل برنامجٍ (شريحة). البيت: الابن + العشرة الأوائل في حلقته (أو البرنامج إن بلا حلقة)،
// شريحةٌ لكل برنامجٍ له. أسماءُ عرضٍ (الأوّل+الأب+العائلة)، ونقاطٌ، وأوسمةٌ (الخمسة الأوائل في المسجد).
// §١٠: نُرسل مع الدورة الافتراضيّة «جدول اليوم» (نوافذ المواعيد محلولةً بأوقات الصلاة) ليختار المتصفّح.

const DEFAULT_SLIDE_SEC = 20;
const TOP_WITH_BADGES = 5; // المسجد: الأوسمة بجانب الخمسة الأوائل فقط
const HOME_TOP = 10;

export type PublicResult = { ok: true; data: unknown } | { ok: false; status: 404 | 429 };

interface PublicRankItem { rank: number; name: string; points: number; badges: string[] }

async function badgeEmojis(studentId: string, db: PrismaClient): Promise<string[]> {
  return (await listStudentBadges(studentId, db)).map((b) => b.emoji ?? "🏅");
}

async function rankItems(rows: RankRow[], db: PrismaClient, withBadgesTop: number): Promise<PublicRankItem[]> {
  const out: PublicRankItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    out.push({ rank: i + 1, name: splitDisplayName(rows[i].name).display, points: rows[i].points, badges: i < withBadgesTop ? await badgeEmojis(rows[i].studentId, db) : [] });
  }
  return out;
}

async function background(kind: DisplayScreenKind, db: PrismaClient) {
  const bg = await db.displayBackground.findFirst({ where: { screenKind: kind, active: true }, orderBy: { createdAt: "desc" }, select: { assetUrl: true, assetType: true } });
  return bg ? { url: bg.assetUrl, type: bg.assetType } : null;
}

/** شريحة ترتيب برنامج (المسجد/المحتوى المجدوَل). null إن غاب البرنامج. */
async function programRankingSlide(programId: string, db: PrismaClient, durationSec = DEFAULT_SLIDE_SEC): Promise<unknown | null> {
  const prog = await db.program.findUnique({ where: { id: programId }, select: { key: true } });
  if (!prog) return null;
  return { type: "program", programNameAr: programName(prog.key), durationSec, ranking: await rankItems(await rankProgram(programId, db), db, TOP_WITH_BADGES) };
}

/** يحوّل صفّ DisplaySlide إلى شريحة عرض (برنامج⟵ترتيب، صورة⟵صورة). null إن ناقص. */
async function renderDisplaySlide(s: DisplaySlide, db: PrismaClient): Promise<unknown | null> {
  if (s.kind === DisplaySlideKind.IMAGE && s.imageUrl) return { type: "image", imageUrl: s.imageUrl, durationSec: s.durationSec };
  if (s.kind === DisplaySlideKind.PROGRAM && s.programId) return programRankingSlide(s.programId, db, s.durationSec);
  return null;
}

async function imageSlides(screenId: string, db: PrismaClient) {
  const imgs = await db.displaySlide.findMany({ where: { screenId, active: true, kind: DisplaySlideKind.IMAGE }, orderBy: { ordinal: "asc" }, select: { imageUrl: true, durationSec: true } });
  return imgs.filter((s) => s.imageUrl).map((s) => ({ type: "image", imageUrl: s.imageUrl, durationSec: s.durationSec }));
}

async function mosquePayload(screenId: string, db: PrismaClient) {
  const slides = await db.displaySlide.findMany({ where: { screenId, active: true }, orderBy: { ordinal: "asc" } });
  const out: unknown[] = [];
  for (const s of slides) {
    const r = await renderDisplaySlide(s, db);
    if (r) out.push(r);
  }
  return out;
}

interface SonCtx { name: string; balance: number; badges: { nameAr: string; emoji: string | null }[]; streak: number; motivation: string | null }
interface SonProgram { programId: string; circleId: string | null; key: string }

async function sonMotivation(studentId: string, db: PrismaClient, now: Date): Promise<{ streak: number; text: string | null }> {
  const marks = await studentDayMarks(studentId, db, now);
  const streak = computeStreak(marks);
  const doneToday = marks[marks.length - 1]?.status === "COMPLETE";
  const ms = buildMotivations({ streakCurrent: streak.current, doneToday, nearestBadge: null, currentStation: null });
  return { streak: streak.current, text: ms[0]?.text ?? null };
}

async function sonContext(studentId: string, db: PrismaClient, now: Date): Promise<SonCtx> {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { user: { select: { nameAsInId: true } } } });
  const [balance, badges, motiv] = await Promise.all([getBalance(studentId, db), listStudentBadges(studentId, db), sonMotivation(studentId, db, now)]);
  return { name: splitDisplayName(student?.user.nameAsInId ?? "").display, balance, badges: badges.map((b) => ({ nameAr: b.nameAr, emoji: b.emoji ?? "🏅" })), streak: motiv.streak, motivation: motiv.text };
}

async function sonPrograms(studentId: string, db: PrismaClient): Promise<SonProgram[]> {
  const enrolls = await db.enrollment.findMany({ where: { studentId, endedAt: null }, select: { programId: true, circleId: true, program: { select: { key: true } } } });
  const progs: SonProgram[] = enrolls.filter((e) => e.programId && e.program).map((e) => ({ programId: e.programId!, circleId: e.circleId, key: e.program!.key }));
  const prof = await db.muddakirProfile.findUnique({ where: { studentId }, select: { studentId: true } });
  if (prof) {
    const mId = await muddakirProgramId(db);
    if (!progs.some((p) => p.programId === mId)) {
      const mp = await db.program.findUnique({ where: { id: mId }, select: { key: true } });
      if (mp) progs.push({ programId: mId, circleId: null, key: mp.key });
    }
  }
  return progs;
}

async function buildHomeSlide(ctx: SonCtx, p: SonProgram, studentId: string, db: PrismaClient, durationSec = DEFAULT_SLIDE_SEC): Promise<unknown> {
  const rows = p.circleId ? await rankCircle(p.circleId, db) : await rankProgram(p.programId, db);
  const idx = rows.findIndex((r) => r.studentId === studentId);
  const top = rows.slice(0, HOME_TOP).map((r, i) => ({ rank: i + 1, name: splitDisplayName(r.name).display, points: r.points, isSon: r.studentId === studentId }));
  return {
    type: "home",
    programNameAr: programName(p.key),
    durationSec,
    son: { name: ctx.name, points: ctx.balance, rank: idx >= 0 ? idx + 1 : null, streak: ctx.streak, motivation: ctx.motivation, badges: ctx.badges },
    top,
  };
}

async function homePayload(studentId: string, screenId: string, db: PrismaClient, now: Date) {
  const progs = await sonPrograms(studentId, db);
  const ctx = await sonContext(studentId, db, now);
  const slides: unknown[] = [];
  for (const p of progs) slides.push(await buildHomeSlide(ctx, p, studentId, db));
  slides.push(...(await imageSlides(screenId, db)));
  return slides;
}

/** شريحة بيتٍ لبرنامجٍ مجدوَل — إن كان الابن منتسباً إليه. null إن لا ينتسب. */
async function homeProgramSlide(studentId: string, programId: string, db: PrismaClient, now: Date): Promise<unknown | null> {
  const progs = await sonPrograms(studentId, db);
  const p = progs.find((x) => x.programId === programId);
  if (!p) return null;
  return buildHomeSlide(await sonContext(studentId, db, now), p, studentId, db);
}

// ───────────── جدول اليوم (§١٠) ─────────────

/** يبني شرائح محتوى موعدٍ: برنامجٌ بعينه (حسب نوع الشاشة)، أو الشرائح المختارة. */
async function buildScheduleSlides(screen: ResolvedScreen, r: DisplaySchedule, db: PrismaClient, now: Date): Promise<unknown[]> {
  if (r.contentMode === DisplayScheduleContent.PROGRAM && r.programId) {
    if (screen.kind === DisplayScreenKind.MOSQUE) {
      const s = await programRankingSlide(r.programId, db);
      return s ? [s] : [];
    }
    if (screen.studentId) {
      const s = await homeProgramSlide(screen.studentId, r.programId, db, now);
      return s ? [s] : [];
    }
    return [];
  }
  // SLIDES: الشرائح المختارة من شرائح الشاشة، بترتيب الاختيار.
  const ids = (r.slideIds ?? "").split(",").filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.displaySlide.findMany({ where: { id: { in: ids }, screenId: screen.id, active: true } });
  const byId = new Map(rows.map((x) => [x.id, x]));
  const out: unknown[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const sl = await renderDisplaySlide(row, db);
    if (sl) out.push(sl);
  }
  return out;
}

/** نوافذ مواعيد اليوم (مرتّبةً بالأولويّة) محلولةً بأوقات صلاة المدينة + منتصف الليل القادم بمكّة. */
async function resolveToday(screen: ResolvedScreen, db: PrismaClient, now: Date) {
  const dateISO = makkahDayDate(now);
  const bounds = makkahDayBounds(dateISO);
  const prayers = madinahPrayerTimesAdjusted(dateISO, screen.adjust);
  const prayerMs = madinahPrayerMs(dateISO, screen.adjust);
  const rows = await db.displaySchedule.findMany({ where: { screenId: screen.id, active: true }, orderBy: { ordinal: "asc" } });
  const schedules: { startMs: number; endMs: number; slides: unknown[] }[] = [];
  for (const r of rows) {
    const w = resolveWindow(toScheduleDef(r), dateISO, prayerMs, bounds.start.getTime());
    if (!w) continue;
    const slides = await buildScheduleSlides(screen, r, db, now);
    if (!slides.length) continue; // موعدٌ بلا محتوًى منطبق ⟵ يُتجاهَل (تعود الدورة الافتراضيّة)
    schedules.push({ startMs: w.startMs, endMs: w.endMs, slides });
  }
  const prayerTimes = Object.fromEntries(PRAYERS.map((p) => [p, hhmmMakkah(prayers[p as Prayer])]));
  return { schedules, dayEndsMs: bounds.end.getTime(), prayerTimes };
}

/** يبني استجابة الشاشة العامّة من رمزها الصريح. يحجب غير الموجود/الملغى (404) ويحدّ المعدّل (429). */
export async function getPublicScreen(token: string, ip: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<PublicResult> {
  const screen = await resolveScreenByToken(token, db);
  if (!screen) return { ok: false, status: 404 };
  if (!(await withinRateLimit(token, ip, db, now))) return { ok: false, status: 429 };

  const bg = await background(screen.kind, db);
  const day = await resolveToday(screen, db, now);
  const base = { nameAr: screen.nameAr, refreshSec: screen.refreshSec, background: bg, ...day };
  if (screen.kind === DisplayScreenKind.MOSQUE) {
    return { ok: true, data: { kind: "MOSQUE", ...base, slides: await mosquePayload(screen.id, db) } };
  }
  const slides = screen.studentId ? await homePayload(screen.studentId, screen.id, db, now) : [];
  return { ok: true, data: { kind: "HOME", ...base, slides } };
}
