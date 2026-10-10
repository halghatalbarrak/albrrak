import { BadgeConditionKind, MuddakirPhase, type PrismaClient } from "@prisma/client";

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
// الشروط المحقّقة الآن: الانتظام (STREAK_DAYS/FIRST_DAY/FIRST_WEEK) والإنجاز (STAGE_COMPLETE/
// TRACK_OR_DEGREE/HIFZ_KHATM/TATHBIT_CERTIFICATE). أمّا الإتقان بلا خطأ (WEEK_NO_ERROR /
// STAGE_RECITATION_NO_ERROR / FACES_HEARD_NO_ERROR) فمعاييرها على سجلّات الأخطاء/التسميع لم
// تُثبَّت بعد، فلا تُمنَح (ترجع false) حتى يُحسم معيارها — لا منحٌ خاطئ.

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

  const met = (kind: BadgeConditionKind, threshold: number | null): boolean => {
    switch (kind) {
      case BadgeConditionKind.STREAK_DAYS: return threshold != null && streak.current >= threshold;
      case BadgeConditionKind.FIRST_DAY: return streak.longest >= 1;
      case BadgeConditionKind.FIRST_WEEK_COMPLETE: return streak.longest >= 7;
      case BadgeConditionKind.STAGE_COMPLETE: return anyStageDone;
      case BadgeConditionKind.TRACK_OR_DEGREE_COMPLETE: return degreeDone;
      case BadgeConditionKind.HIFZ_KHATM: return khatm;
      case BadgeConditionKind.TATHBIT_CERTIFICATE: return certified;
      default: return false; // WEEK_NO_ERROR / STAGE_RECITATION_NO_ERROR / FACES_HEARD_NO_ERROR — بانتظار المعيار
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
