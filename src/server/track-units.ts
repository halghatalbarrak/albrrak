import { ProgramKey, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ═══════════════ وحدات المسارات المُجهَّزة — القراءة (البند ٢، المرحلة ٣) ═══════════════
//
// طبقة قراءةٍ فوق TrackUnit (المبذورة بسكربت). تخدم المرحلة ٤ (وجهة اليوم):
//   unitsForTrack       — كل وحدات المسار (إدارةً وعرضًا).
//   nextUnitForStudent  — وحدة الحفظ التالية (تلي موضع الطالب في مساره).
//   progressInTrack     — رقم وحدته الحاليّة من الإجماليّ (نسبة).
// لا تمسّ منطق الجلسة/الحصاد — قراءةٌ فقط.

/** ترتيب حفظ مراقي: الفاتحة ثمّ الناس (١١٤) نزولاً حتى البقرة (٢). */
export const MARAQI_SURAH_ORDER: number[] = [1, ...Array.from({ length: 113 }, (_, i) => 114 - i)];
const ORDER_INDEX = new Map(MARAQI_SURAH_ORDER.map((s, i) => [s, i]));

/** مفتاح ترتيبٍ بترتيب حفظ مراقي: موضع السورة (تنازليّ) ثمّ الآية (تصاعديّ). */
export function maraqiKey(surah: number, ayah: number): number {
  return (ORDER_INDEX.get(surah) ?? 999) * 100_000 + ayah;
}

export interface UnitRow {
  unitNo: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export interface TrackAdminRow {
  id: string;
  nameAr: string;
  linesPerDay: number;
  ordinal: number;
  isActive: boolean;
  unitCount: number;
}

/** المسارات الثمانية بمقدارها وعدد وحداتها المُجهَّزة — لشاشة الإدارة. */
export async function listTracksAdmin(db: PrismaClient = prisma): Promise<TrackAdminRow[]> {
  const program = await db.program.findUnique({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
  if (!program) return [];
  const tracks = await db.track.findMany({
    where: { programId: program.id },
    orderBy: { ordinal: "asc" },
    select: { id: true, nameAr: true, linesPerDay: true, ordinal: true, isActive: true },
  });
  const out: TrackAdminRow[] = [];
  for (const t of tracks) {
    const unitCount = await db.trackUnit.count({ where: { trackId: t.id } });
    out.push({ ...t, unitCount });
  }
  return out;
}

/** تفعيل/تعطيل مسار (إدارةً). */
export async function setTrackActive(trackId: string, isActive: boolean, db: PrismaClient = prisma): Promise<void> {
  await db.track.update({ where: { id: trackId }, data: { isActive } });
}

/** كل وحدات المسار مرتّبةً بترتيب الحفظ. */
export async function unitsForTrack(trackId: string, db: PrismaClient = prisma): Promise<UnitRow[]> {
  return db.trackUnit.findMany({
    where: { trackId },
    orderBy: { unitNo: "asc" },
    select: { unitNo: true, startSurah: true, startAyah: true, endSurah: true, endAyah: true },
  });
}

/** مسار الطالب المُسنَد حاليًّا (أحدث إسنادٍ نشط، endedAt=null)، أو null. */
async function assignedTrackId(studentId: string, db: PrismaClient): Promise<string | null> {
  const a = await db.trackAssignment.findFirst({
    where: { studentId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { trackId: true },
  });
  return a?.trackId ?? null;
}

/**
 * أبعدُ موضعٍ حفظه الطالب بترتيب مراقي (مفتاح maraqi لأقصى نهايةِ جلسة حفظ)، أو null إن لم
 * يبدأ. يُشتقّ من جلسات الحفظ (لا يمسّها) — نهاية كل جلسةٍ هي منتهاها في السورة.
 */
async function frontierKey(studentId: string, db: PrismaClient): Promise<number | null> {
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

/**
 * وحدة الحفظ التالية للطالب = أول وحدةٍ في مساره تبدأ بعد موضعه الحاليّ (بترتيب مراقي).
 * لم يبدأ ⟵ الوحدة ١ (الفاتحة). أتمّ المسار ⟵ null. لا مسارٌ مُسنَد ⟵ null.
 */
export async function nextUnitForStudent(studentId: string, db: PrismaClient = prisma): Promise<UnitRow | null> {
  const trackId = await assignedTrackId(studentId, db);
  if (!trackId) return null;
  const units = await unitsForTrack(trackId, db);
  if (units.length === 0) return null;
  const fk = await frontierKey(studentId, db);
  if (fk === null) return units[0];
  return units.find((u) => maraqiKey(u.startSurah, u.startAyah) > fk) ?? null;
}

/**
 * تقدّم الطالب في مساره: رقم وحدته الحاليّة (عدد الوحدات التي بلغها موضعه) من الإجماليّ،
 * ونسبةٌ مئويّة. لا مسارٌ مُسنَد ⟵ null. لم يبدأ ⟵ صفرٌ من الإجماليّ.
 */
export async function progressInTrack(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<{ currentUnitNo: number; totalUnits: number; percent: number } | null> {
  const trackId = await assignedTrackId(studentId, db);
  if (!trackId) return null;
  const units = await unitsForTrack(trackId, db);
  const totalUnits = units.length;
  if (totalUnits === 0) return { currentUnitNo: 0, totalUnits: 0, percent: 0 };
  const fk = await frontierKey(studentId, db);
  const currentUnitNo = fk === null ? 0 : units.filter((u) => maraqiKey(u.startSurah, u.startAyah) <= fk).length;
  return { currentUnitNo, totalUnits, percent: Math.round((currentUnitNo / totalUnits) * 100) };
}
