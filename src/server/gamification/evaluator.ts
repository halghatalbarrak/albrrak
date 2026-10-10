import { BadgeConditionKind, MuddakirErrorSource, MuddakirPhase, MuddakirRecitationKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStageProgress } from "@/server/muddakir-stages";
import { awardBadge } from "./badges";
import { studentStreak } from "./day-marks";
import { roadmapsForStudent } from "./roadmap";

// ═══════════════ مُقيّم الأوسمة (ل٤، §٥) ═══════════════
//
// يقرأ حالة الطالب الآنيّة (السلسلة + خرائط البرامج + حالة المدّكر) ويمنح كلّ وسامٍ مفعّلٍ تحقّق
// شرطه، عبر awardBadge (المحميّ @@unique) — فالمنح مرّةً واحدة ولو استُدعي المُقيّم مراراً. يُستدعى
// بكسلٍ عند عرض صفحة الطالب (ل٥) وآمنٌ للاستدعاء من نقاط الأحداث القائمة أيضاً.
//
// الشروط: الانتظام (STREAK_DAYS/FIRST_DAY/FIRST_WEEK)، والإنجاز (STAGE_COMPLETE/TRACK_OR_DEGREE/
// HIFZ_KHATM/TATHBIT_CERTIFICATE)، والإتقان بلا خطأ (WEEK_NO_ERROR/STAGE_RECITATION_NO_ERROR/
// FACES_HEARD_NO_ERROR — تُحسب أخطاء المشرف/المختبِر وحدها، لا الذاتيّة؛ ل٧، §٥).

export async function evaluateBadges(db: PrismaClient = prisma, studentId: string, now: Date = new Date()): Promise<string[]> {
  const defs = await db.badgeDefinition.findMany({ where: { active: true } });
  if (!defs.length) return [];

  const [streak, roadmaps, profile] = await Promise.all([
    studentStreak(studentId, db, now),
    roadmapsForStudent(studentId, db),
    db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true, tathbitDegree: true } }),
  ]);
  const anyStageDone = roadmaps.some((r) => r.stations.some((s) => s.state === "DONE"));

  let khatm = false;
  if (profile) {
    if (profile.phase === MuddakirPhase.MEMORIZE) { try { khatm = (await getStageProgress(studentId, db)).graduated; } catch { khatm = false; } }
    else khatm = true; // TATHBIT/PERMANENT ⟵ ختم الحفظ تمّ قبلهما
  }
  const degreeDone = !!profile && (profile.phase === MuddakirPhase.PERMANENT || (profile.phase === MuddakirPhase.TATHBIT && (profile.tathbitDegree ?? 1) > 1));
  const certified = !!profile && profile.phase === MuddakirPhase.PERMANENT;

  // أوسمة الإتقان بلا خطأ (§٥): تُحسب أخطاء المشرف/المختبِر **وحدها** — لا أخطاء الحافظ الذاتيّة
  // (repErrors وRIBAT/REVIEW)، كيلا يُكافأ إخفاء الخطأ. تُحسب فقط عند وجود تعريفٍ مفعّلٍ من نوعها.
  const kinds = new Set(defs.map((d) => d.kind));
  const DAY = 86_400_000;
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  let weekNoError = false;
  let stageReciteNoError = false;
  let cleanHeard = 0;

  if (kinds.has(BadgeConditionKind.WEEK_NO_ERROR)) {
    const weeks = await db.muddakirWeek.findMany({ where: { studentId, regularityConfirmedAt: { not: null } }, select: { weekStart: true } });
    if (weeks.length) {
      const supTimes = (await db.muddakirError.findMany({ where: { studentId, source: MuddakirErrorSource.SUPERVISOR }, select: { openedOn: true } })).map((e) => e.openedOn.getTime());
      weekNoError = weeks.some((w) => { const s = w.weekStart.getTime(); return !supTimes.some((t) => t >= s && t < s + 7 * DAY); });
    }
  }
  if (kinds.has(BadgeConditionKind.STAGE_RECITATION_NO_ERROR)) {
    const recs = await db.muddakirRecitation.findMany({ where: { studentId, kind: MuddakirRecitationKind.STAGE, passed: true }, select: { recitedOn: true } });
    if (recs.length) {
      const exDays = new Set((await db.muddakirError.findMany({ where: { studentId, source: MuddakirErrorSource.EXAMINER }, select: { openedOn: true } })).map((e) => dateKey(e.openedOn)));
      stageReciteNoError = recs.some((r) => !exDays.has(dateKey(r.recitedOn)));
    }
  }
  if (kinds.has(BadgeConditionKind.FACES_HEARD_NO_ERROR)) {
    const heard = await db.muddakirFace.findMany({ where: { studentId, heardAt: { not: null } }, select: { page: true } });
    if (heard.length) {
      const supPages = new Set((await db.muddakirError.findMany({ where: { studentId, source: MuddakirErrorSource.SUPERVISOR }, select: { page: true } })).map((e) => e.page));
      cleanHeard = heard.filter((f) => !supPages.has(f.page)).length;
    }
  }

  const met = (kind: BadgeConditionKind, threshold: number | null): boolean => {
    switch (kind) {
      case BadgeConditionKind.STREAK_DAYS: return threshold != null && streak.current >= threshold;
      case BadgeConditionKind.FIRST_DAY: return streak.longest >= 1;
      case BadgeConditionKind.FIRST_WEEK_COMPLETE: return streak.longest >= 7;
      case BadgeConditionKind.STAGE_COMPLETE: return anyStageDone;
      case BadgeConditionKind.TRACK_OR_DEGREE_COMPLETE: return degreeDone;
      case BadgeConditionKind.HIFZ_KHATM: return khatm;
      case BadgeConditionKind.TATHBIT_CERTIFICATE: return certified;
      case BadgeConditionKind.WEEK_NO_ERROR: return weekNoError;
      case BadgeConditionKind.STAGE_RECITATION_NO_ERROR: return stageReciteNoError;
      case BadgeConditionKind.FACES_HEARD_NO_ERROR: return threshold != null && cleanHeard >= threshold;
      default: return false;
    }
  };

  const awarded: string[] = [];
  for (const d of defs) {
    if (!met(d.kind, d.threshold)) continue;
    const g = await awardBadge(db, { studentId, badgeDefId: d.id, sourceEvent: `EVAL:${d.kind}` });
    if (g) awarded.push(d.code);
  }
  return awarded;
}
