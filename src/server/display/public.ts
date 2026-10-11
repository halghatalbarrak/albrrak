import { DisplayScreenKind, DisplaySlideKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { splitDisplayName } from "@/lib/display-name";
import { programName } from "@/i18n/ar/gamification";
import { muddakirProgramId } from "@/server/muddakir-profile";
import { getBalance } from "@/server/economy";
import { listStudentBadges } from "@/server/gamification/badges";
import { studentDayMarks } from "@/server/gamification/day-marks";
import { computeStreak } from "@/server/gamification/streak";
import { buildMotivations } from "@/server/gamification/motivation";
import { resolveScreenByToken } from "./screens";
import { rankCircle, rankProgram, type RankRow } from "./ranking";
import { withinRateLimit } from "./rate-limit";

// ═══════════════ القراءة العامّة بالرمز (ش٢) ═══════════════
//
// للعرض فقط: لا تكشف أيّ معرّفٍ داخليّ (studentId/circleId/programId/screenId) ولا بيانةً غير معروضة.
// المسجد: ترتيب كل برنامجٍ (شريحة). البيت: الابن + العشرة الأوائل في حلقته (أو البرنامج إن بلا حلقة)،
// شريحةٌ لكل برنامجٍ له. أسماءُ عرضٍ (الأوّل+الأب+العائلة)، ونقاطٌ، وأوسمةٌ (الخمسة الأوائل في المسجد).

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

async function imageSlides(screenId: string, db: PrismaClient) {
  const imgs = await db.displaySlide.findMany({ where: { screenId, active: true, kind: DisplaySlideKind.IMAGE }, orderBy: { ordinal: "asc" }, select: { imageUrl: true, durationSec: true } });
  return imgs.filter((s) => s.imageUrl).map((s) => ({ type: "image", imageUrl: s.imageUrl, durationSec: s.durationSec }));
}

async function mosquePayload(screenId: string, db: PrismaClient) {
  const slides = await db.displaySlide.findMany({ where: { screenId, active: true }, orderBy: { ordinal: "asc" } });
  const out: unknown[] = [];
  for (const s of slides) {
    if (s.kind === DisplaySlideKind.IMAGE && s.imageUrl) {
      out.push({ type: "image", imageUrl: s.imageUrl, durationSec: s.durationSec });
    } else if (s.kind === DisplaySlideKind.PROGRAM && s.programId) {
      const prog = await db.program.findUnique({ where: { id: s.programId }, select: { key: true } });
      if (!prog) continue;
      out.push({ type: "program", programNameAr: programName(prog.key), durationSec: s.durationSec, ranking: await rankItems(await rankProgram(s.programId, db), db, TOP_WITH_BADGES) });
    }
  }
  return out;
}

async function sonMotivation(studentId: string, db: PrismaClient, now: Date): Promise<{ streak: number; text: string | null }> {
  const marks = await studentDayMarks(studentId, db, now);
  const streak = computeStreak(marks);
  const doneToday = marks[marks.length - 1]?.status === "COMPLETE";
  const ms = buildMotivations({ streakCurrent: streak.current, doneToday, nearestBadge: null, currentStation: null });
  return { streak: streak.current, text: ms[0]?.text ?? null };
}

async function homePayload(studentId: string, screenId: string, db: PrismaClient, now: Date) {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { user: { select: { nameAsInId: true } } } });
  const sonName = splitDisplayName(student?.user.nameAsInId ?? "").display;

  // برامج الابن: من التحاقه النشط (برنامجٌ واحدٌ بحكم القيد) + المدّكر إن كان له ملفٌّ بلا التحاق.
  const enrolls = await db.enrollment.findMany({ where: { studentId, endedAt: null }, select: { programId: true, circleId: true, program: { select: { key: true } } } });
  const progs: { programId: string; circleId: string | null; key: string }[] = enrolls
    .filter((e) => e.programId && e.program)
    .map((e) => ({ programId: e.programId!, circleId: e.circleId, key: e.program!.key }));
  const prof = await db.muddakirProfile.findUnique({ where: { studentId }, select: { studentId: true } });
  if (prof) {
    const mId = await muddakirProgramId(db);
    if (!progs.some((p) => p.programId === mId)) {
      const mp = await db.program.findUnique({ where: { id: mId }, select: { key: true } });
      if (mp) progs.push({ programId: mId, circleId: null, key: mp.key });
    }
  }

  const [balance, badges, motiv] = await Promise.all([getBalance(studentId, db), listStudentBadges(studentId, db), sonMotivation(studentId, db, now)]);
  const sonBadges = badges.map((b) => ({ nameAr: b.nameAr, emoji: b.emoji ?? "🏅" }));

  const slides: unknown[] = [];
  for (const p of progs) {
    const rows = p.circleId ? await rankCircle(p.circleId, db) : await rankProgram(p.programId, db);
    const idx = rows.findIndex((r) => r.studentId === studentId);
    const top = rows.slice(0, HOME_TOP).map((r, i) => ({ rank: i + 1, name: splitDisplayName(r.name).display, points: r.points, isSon: r.studentId === studentId }));
    slides.push({
      type: "home",
      programNameAr: programName(p.key),
      durationSec: DEFAULT_SLIDE_SEC,
      son: { name: sonName, points: balance, rank: idx >= 0 ? idx + 1 : null, streak: motiv.streak, motivation: motiv.text, badges: sonBadges },
      top,
    });
  }
  slides.push(...(await imageSlides(screenId, db)));
  return slides;
}

/** يبني استجابة الشاشة العامّة من رمزها الصريح. يحجب غير الموجود/الملغى (404) ويحدّ المعدّل (429). */
export async function getPublicScreen(token: string, ip: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<PublicResult> {
  const screen = await resolveScreenByToken(token, db);
  if (!screen) return { ok: false, status: 404 };
  if (!(await withinRateLimit(token, ip, db, now))) return { ok: false, status: 429 };

  const bg = await background(screen.kind, db);
  if (screen.kind === DisplayScreenKind.MOSQUE) {
    return { ok: true, data: { kind: "MOSQUE", nameAr: screen.nameAr, refreshSec: screen.refreshSec, background: bg, slides: await mosquePayload(screen.id, db) } };
  }
  const slides = screen.studentId ? await homePayload(screen.studentId, screen.id, db, now) : [];
  return { ok: true, data: { kind: "HOME", nameAr: screen.nameAr, refreshSec: screen.refreshSec, background: bg, slides } };
}
