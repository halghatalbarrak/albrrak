import { ProgramKey, StageKind, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { maraqiKey } from "@/lib/maraqi-order";

// ═══════════════ المراحل بحدود السور (مراقي ٢ — القرار أ، MARAQI_RULES «خريطة المراحل») ═══════════════
//
// المرحلة = مدىً في ترتيب حفظ مراقي (الفاتحة ثمّ الناس نزولاً)، محدودٌ بسورتها الأخيرة على
// MAIN_STAGE (fromSurah/toSurah). المرحلة الحاليّة والاستحقاق يُحسبان من **جبهة الطالب** (أبعد
// ما حفظ) لا من اكتمال الأحزاب. الحصاد يبقى بالحزب (SUB_STAGE) بلا مساس. طبقة قراءةٍ مشتركة.

type Db = PrismaClient | Prisma.TransactionClient;

export interface MaraqiPhase {
  id: string;
  ordinal: number;
  nameAr: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  /** مفتاح ترتيب مراقي لنهاية المرحلة (سورة الحدّ وآخر آية). */
  endKey: number;
}

/** المراحل الستّ بحدود السور (MAIN_STAGE لمراقي) مرتّبةً بترتيبها، بمفتاح نهايةٍ محسوب. */
export async function loadMaraqiPhases(db: Db = prisma): Promise<MaraqiPhase[]> {
  const rows = await db.stage.findMany({
    where: { kind: StageKind.MAIN_STAGE, program: { key: ProgramKey.MARAQI }, toSurah: { not: null } },
    orderBy: { ordinal: "asc" },
    select: { id: true, ordinal: true, nameAr: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true },
  });
  return rows
    .filter((r) => r.fromSurah != null && r.fromAyah != null && r.toSurah != null && r.toAyah != null)
    .map((r) => ({
      id: r.id, ordinal: r.ordinal, nameAr: r.nameAr,
      fromSurah: r.fromSurah!, fromAyah: r.fromAyah!, toSurah: r.toSurah!, toAyah: r.toAyah!,
      endKey: maraqiKey(r.toSurah!, r.toAyah!),
    }));
}

/** جبهة الطالب = أبعد موضعٍ حفظه بترتيب مراقي (أقصى نهاية جلسة حفظ)، أو null إن لم يبدأ. */
export async function maraqiFrontierKey(db: Db, studentId: string): Promise<number | null> {
  const sessions = await db.dailySession.findMany({
    where: { studentId, hifzToSurah: { not: null } },
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

/** المرحلة التي تقع فيها جبهةٌ ما = أوّل مرحلةٍ (ترتيبًا) لم تتجاوز الجبهةُ نهايتَها؛ وإلّا الأخيرة. */
export function phaseForFrontier(frontierKey: number | null, phases: readonly MaraqiPhase[]): MaraqiPhase | null {
  if (phases.length === 0) return null;
  if (frontierKey === null) return phases[0];
  return phases.find((p) => frontierKey <= p.endKey) ?? phases[phases.length - 1];
}
