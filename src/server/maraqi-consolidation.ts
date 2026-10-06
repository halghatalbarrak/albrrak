import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ayahOrdinal } from "./quran-ordinal";
import { maraqiKey, unitsForTrack, type UnitRow } from "./track-units";

// ═══════════════ منهج الترسيخ والمراجعة بالوحدات لكلّ مسار (مراقي ٢) ═══════════════
//
// حسم محمد (مراقي ٢): المقادير **تُضبط لكلّ مسار من الإدارة** لا ثوابت في الكود.
//   • الترسيخ = `tarseekhUnits` وحدةً سابقةً لوحدة اليوم في ترتيب المسار (لا «آخر ١٠ جلسات»).
//   • المراجعة = كلّ المحفوظ (ما قبل نافذة الترسيخ) مقسومًا على `reviewDaysPerWeek`، حصصًا بحدود
//     وحداتٍ كاملة، متقاربةَ الحجم بالأسطر (MushafLine)، فيُختَم المحفوظ أسبوعيًّا بلا سقف.
// دوالٌّ مشتركةٌ يستعملها محرّك اليوم (today-target) وعرض الترسيخ (tarseekh) — مصدرٌ واحد.

export interface TrackPolicy {
  trackId: string | null;
  tarseekhUnits: number;
  reviewDaysPerWeek: number;
  units: UnitRow[];
}

/** مسار الطالب المُسنَد (أحدث نشط) وسياسته (المقادير) ووحداته. بلا مسارٍ ⟵ قيمٌ افتراضيّة ووحداتٌ فارغة. */
export async function trackPolicyAndUnits(studentId: string, db: PrismaClient = prisma): Promise<TrackPolicy> {
  const a = await db.trackAssignment.findFirst({ where: { studentId, endedAt: null }, orderBy: { startedAt: "desc" }, select: { trackId: true } });
  if (!a) return { trackId: null, tarseekhUnits: 10, reviewDaysPerWeek: 5, units: [] };
  const track = await db.track.findUnique({ where: { id: a.trackId }, select: { tarseekhUnits: true, reviewDaysPerWeek: true } });
  const units = await unitsForTrack(a.trackId, db);
  return {
    trackId: a.trackId,
    tarseekhUnits: track?.tarseekhUnits ?? 10,
    reviewDaysPerWeek: track?.reviewDaysPerWeek ?? 5,
    units,
  };
}

/** عدد أسطر MushafLine لكلّ وحدة (لموازنة حصص المراجعة) — بعدّ الأسطر التي تبدأ ضمن مدى الوحدة. */
export async function unitLineWeights(units: readonly UnitRow[], db: PrismaClient = prisma): Promise<Map<number, number>> {
  const w = new Map<number, number>();
  if (units.length === 0) return w;
  const lines = await db.mushafLine.findMany({ select: { startSurah: true, startAyah: true } });
  const starts = lines.map((l) => ayahOrdinal(l.startSurah, l.startAyah)).sort((a, b) => a - b);
  // عدد نقاط البداية في [lo, hi] — بحثٌ ثنائيّ على مصفوفةٍ مرتّبة.
  const countInRange = (lo: number, hi: number): number => {
    const lower = lowerBound(starts, lo);
    const upper = upperBound(starts, hi);
    return Math.max(0, upper - lower);
  };
  for (const u of units) {
    const a = ayahOrdinal(u.startSurah, u.startAyah);
    const b = ayahOrdinal(u.endSurah, u.endAyah);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    w.set(u.unitNo, Math.max(1, countInRange(lo, hi))); // وحدةٌ لا تقلّ عن سطرٍ واحد
  }
  return w;
}

function lowerBound(arr: readonly number[], x: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
function upperBound(arr: readonly number[], x: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * يقسّم وحدات المراجعة إلى `days` حصصًا متتاليةً، بحدود وحداتٍ كاملة، متقاربةَ الحجم بالأسطر
 * (جشِعٌ على الوزن): كلّ وحدةٍ في حصّةٍ واحدة، تُغطّى الوحدات كلّها بلا تكرارٍ ولا سقوط. وحداتٌ
 * أقلّ من الأيّام ⟵ بعض الحصص فارغة (مراجعةٌ قصيرةٌ أوّل المسار، بلا خطأ).
 */
export function partitionByLines(units: readonly UnitRow[], weights: Map<number, number>, days: number): UnitRow[][] {
  const d = Math.max(1, days);
  const chunks: UnitRow[][] = Array.from({ length: d }, () => []);
  if (units.length === 0) return chunks;
  const total = units.reduce((s, u) => s + (weights.get(u.unitNo) ?? 1), 0);
  const target = total / d;
  let acc = 0, ci = 0;
  for (const u of units) {
    chunks[ci].push(u);
    acc += weights.get(u.unitNo) ?? 1;
    if (ci < d - 1 && acc >= target * (ci + 1)) ci++;
  }
  return chunks;
}

/** مفتاح مراقي لأبعد موضعٍ بلغه الطالب (جلسات الحفظ + التسكين)، أو null. `before` يستثني يومًا فأحدث. */
export async function memorizedFrontier(studentId: string, db: PrismaClient, before?: Date): Promise<number | null> {
  const sessions = await db.dailySession.findMany({
    where: { studentId, hifzToSurah: { not: null }, ...(before ? { date: { lt: before } } : {}) },
    select: { hifzToSurah: true, hifzToAyah: true },
  });
  let best: number | null = null;
  for (const s of sessions) {
    if (s.hifzToSurah == null) continue;
    const k = maraqiKey(s.hifzToSurah, s.hifzToAyah ?? 1);
    if (best === null || k > best) best = k;
  }
  const placement = await db.maraqiPlacement.findUnique({ where: { studentId }, select: { reachedSurah: true, reachedAyah: true } });
  if (placement?.reachedSurah != null) {
    const k = maraqiKey(placement.reachedSurah, placement.reachedAyah ?? 1);
    if (best === null || k > best) best = k;
  }
  return best;
}
