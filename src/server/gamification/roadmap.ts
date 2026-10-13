import { MuddakirPhase, ProgramKey, StageKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStageProgress } from "@/server/muddakir-stages";
import { listTathbitLadder } from "@/server/muddakir-config";
import { loadMaraqiPhases, maraqiFrontierKey, phaseForFrontier } from "@/server/maraqi-phase";
import { getQaidahPosition } from "@/server/qaidah-session";
import { tMuddakir, stageLabel } from "@/i18n/ar/muddakir";
import { arNum } from "@/lib/format";

// ═══════════════ خريطة الطريق — محوّلات (ل٣، §٢) ═══════════════
//
// الخريطة **عرضٌ فقط**: تقرأ المحطّات وحالاتها من منطق كلّ برنامجٍ القائم دون تكراره ولا استحداث
// منطقٍ جديد. القفل يعكس الفرونتير القائم: ما قبل الحاليّة مُنجَز، وما بعدها مقفل. المحوّل لكلّ
// برنامجٍ يحسب قائمة المحطّات ومؤشّر الحاليّة من دالّة موضعه، ثمّ buildStations يُسبغ الحالات.

export type StationState = "DONE" | "CURRENT" | "LOCKED";
export interface Station { key: string; label: string; state: StationState; progress?: { done: number; total: number } }
export interface Roadmap { programKey: string; stations: Station[]; currentKey: string | null }

interface Entry { key: string; label: string; progress?: { done: number; total: number } }

/**
 * يُسبغ الحالات على محطّاتٍ مرتّبة: ما قبل currentIndex مُنجَز، وعنده الحاليّة (بتقدّمها)، وبعده
 * مقفل. currentIndex ≥ الطول ⟵ الكلّ مُنجَز (تخرّج) وبلا حاليّة.
 */
export function buildStations(entries: readonly Entry[], currentIndex: number): Station[] {
  return entries.map((e, i) => ({
    key: e.key,
    label: e.label,
    state: i < currentIndex ? "DONE" : i === currentIndex ? "CURRENT" : "LOCKED",
    ...(i === currentIndex && e.progress ? { progress: e.progress } : {}),
  }));
}

const asRoadmap = (programKey: string, entries: Entry[], currentIndex: number): Roadmap => ({
  programKey,
  stations: buildStations(entries, currentIndex),
  currentKey: currentIndex >= 0 && currentIndex < entries.length ? entries[currentIndex].key : null,
});

// ── المدّكر: المراحل ٦ ثمّ درجات التثبيت المفعّلة ثمّ الورد الدائم ──
export async function muddakirRoadmap(studentId: string, db: PrismaClient = prisma): Promise<Roadmap | null> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId } });
  if (!profile) return null;
  const degrees = (await listTathbitLadder(db)).filter((d) => d.active);
  const entries: Entry[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ key: `stage-${i + 1}`, label: stageLabel(i + 1) })),
    ...degrees.map((d) => ({ key: `degree-${d.degreeNo}`, label: `${tMuddakir("wardDegree")} ${arNum(d.degreeNo)}` })),
    { key: "permanent", label: tMuddakir("permanentWardTitle") },
  ];
  const permIndex = 6 + degrees.length;

  let currentIndex: number;
  if (profile.phase === MuddakirPhase.MEMORIZE) {
    const sp = await getStageProgress(studentId, db);
    currentIndex = sp.stage - 1;
    entries[currentIndex].progress = { done: sp.memorized, total: sp.total };
  } else if (profile.phase === MuddakirPhase.TATHBIT) {
    const degIdx = degrees.findIndex((d) => d.degreeNo === (profile.tathbitDegree ?? degrees[0]?.degreeNo));
    currentIndex = 6 + (degIdx < 0 ? 0 : degIdx);
    const kc = (degIdx < 0 ? degrees[0]?.khatmaCount : degrees[degIdx]?.khatmaCount) ?? 0;
    if (kc > 0) entries[currentIndex].progress = { done: profile.khatmaInDegree, total: kc };
  } else {
    currentIndex = permIndex; // PERMANENT
  }
  return asRoadmap(ProgramKey.MUDDAKIR, entries, currentIndex);
}

// ── مراقي: المراحل الستّ بحدود السور محطّاتٌ، والحاليّة = التي تقع فيها جبهة الطالب (مراقي ٢، أ) ──
export async function maraqiRoadmap(studentId: string, db: PrismaClient = prisma): Promise<Roadmap | null> {
  const phases = await loadMaraqiPhases(db);
  if (!phases.length) return null;
  const entries: Entry[] = phases.map((p) => ({ key: `main-${p.ordinal}`, label: p.nameAr }));

  let frontier: number | null = null;
  try { frontier = await maraqiFrontierKey(db, studentId); } catch { frontier = null; }
  const cur = phaseForFrontier(frontier, phases);
  const currentIndex = cur ? phases.findIndex((p) => p.id === cur.id) : 0;
  return asRoadmap(ProgramKey.MARAQI, entries, currentIndex);
}

// ── القاعدة المدنية: الدروس محطّاتٌ، المنجَز = الدروس المُتقَنة، والحاليّة = التالي ──
export async function qaidahRoadmap(studentId: string, db: PrismaClient = prisma): Promise<Roadmap | null> {
  let pos: Awaited<ReturnType<typeof getQaidahPosition>> | null = null;
  try { pos = await getQaidahPosition(studentId, db); } catch { pos = null; }
  if (!pos || !pos.seeded) return null;
  const program = await db.program.findUnique({ where: { key: ProgramKey.QAIDAH_MADANIYYAH }, select: { id: true } });
  if (!program) return null;
  const lessons = await db.stage.findMany({ where: { programId: program.id, kind: StageKind.LESSON }, orderBy: { ordinal: "asc" }, select: { nameAr: true } });
  if (!lessons.length) return null;
  const entries: Entry[] = lessons.map((l, i) => ({ key: `lesson-${i + 1}`, label: l.nameAr }));
  const currentIndex = pos.graduated ? entries.length : Math.min(pos.completedLessons, entries.length);
  return asRoadmap(ProgramKey.QAIDAH_MADANIYYAH, entries, currentIndex);
}

/** خرائط البرامج التي يلتحق بها الطالب (المدّكر/مراقي/القاعدة). WEEKLY مؤجّلٌ (يُعرض في الصفحة). */
export async function roadmapsForStudent(studentId: string, db: PrismaClient = prisma): Promise<Roadmap[]> {
  const [mud, mar, qai] = await Promise.all([
    muddakirRoadmap(studentId, db).catch(() => null),
    maraqiRoadmap(studentId, db).catch(() => null),
    qaidahRoadmap(studentId, db).catch(() => null),
  ]);
  return [mud, mar, qai].filter((r): r is Roadmap => r != null);
}
