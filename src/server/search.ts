import { ProgramKey, StageKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { facePagesInRange } from "./mushaf";

// البحث الموحّد (الفكرة ٨): أسماء الطلاب · الحلقات · أرقام الأحزاب · السور والآيات —
// كلٌّ ينقل مباشرةً لصفحته. أداةٌ للكادر (لا يبحث الطالب في غيره). قراءةٌ فقط.

export interface SearchHit { label: string; sub?: string; href: string }
export interface SearchResults {
  students: SearchHit[];
  circles: SearchHit[];
  mushaf: SearchHit[];
}

/** يحلّ (سورة، آية) إلى رقم الوجه الذي يحويها. */
async function faceOfAyah(surah: number, ayah: number, db: PrismaClient): Promise<number | null> {
  const cands = await db.mushafFace.findMany({
    where: { fromSurah: { lte: surah }, toSurah: { gte: surah } },
    orderBy: { page: "asc" },
    select: { page: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true },
  });
  const ge = (s: number, a: number, s0: number, a0: number) => s > s0 || (s === s0 && a >= a0);
  const le = (s: number, a: number, s1: number, a1: number) => s < s1 || (s === s1 && a <= a1);
  const hit = cands.find((f) => ge(surah, ayah, f.fromSurah, f.fromAyah) && le(surah, ayah, f.toSurah, f.toAyah));
  return hit?.page ?? cands[0]?.page ?? null;
}

/** أوّل وجهٍ لسورة. */
async function faceOfSurah(surah: number, db: PrismaClient): Promise<number | null> {
  const f = await db.mushafFace.findFirst({
    where: { fromSurah: { lte: surah }, toSurah: { gte: surah } },
    orderBy: { page: "asc" }, select: { page: true },
  });
  return f?.page ?? null;
}

/** أوّل وجهٍ لحزبٍ (من حدود مرحلته الفرعية في مراقي). */
async function faceOfHizb(hizb: number, db: PrismaClient): Promise<number | null> {
  const stage = await db.stage.findFirst({
    where: { kind: StageKind.SUB_STAGE, hizbNumber: hizb, program: { key: ProgramKey.MARAQI } },
    select: { fromSurah: true, fromAyah: true, toSurah: true, toAyah: true },
  });
  if (!stage || stage.fromSurah == null || stage.fromAyah == null || stage.toSurah == null || stage.toAyah == null) return null;
  const pages = await facePagesInRange({ fromSurah: stage.fromSurah, fromAyah: stage.fromAyah, toSurah: stage.toSurah, toAyah: stage.toAyah }, db);
  return [...pages].sort((a, b) => a - b)[0] ?? null;
}

export async function searchAll(q: string, db: PrismaClient = prisma): Promise<SearchResults> {
  const query = q.trim();
  const empty: SearchResults = { students: [], circles: [], mushaf: [] };
  if (query.length < 2) return empty;

  // أسماء الطلاب.
  const students = await db.student.findMany({
    where: { user: { nameAsInId: { contains: query, mode: "insensitive" } } },
    select: { id: true, user: { select: { nameAsInId: true } } },
    take: 6,
  });

  // الحلقات.
  const circles = await db.circle.findMany({
    where: { nameAr: { contains: query, mode: "insensitive" } },
    select: { id: true, nameAr: true }, take: 6,
  });

  // المصحف: «سورة:آية» أو «حزب N» أو رقمٌ (سورة).
  const mushaf: SearchHit[] = [];
  const ayahMatch = query.match(/^(\d{1,3})\s*[:٫،]\s*(\d{1,3})$/);
  const hizbMatch = query.match(/^(?:ال)?حزب\s*(\d{1,2})$/);
  if (ayahMatch) {
    const s = Number(ayahMatch[1]), a = Number(ayahMatch[2]);
    const page = s >= 1 && s <= 114 ? await faceOfAyah(s, a, db) : null;
    if (page) mushaf.push({ label: `سورة ${s} · آية ${a}`, sub: `وجه ص${page}`, href: `/mushaf/${page}` });
  } else if (hizbMatch) {
    const h = Number(hizbMatch[1]);
    const page = h >= 1 && h <= 60 ? await faceOfHizb(h, db) : null;
    if (page) mushaf.push({ label: `الحزب ${h}`, sub: `وجه ص${page}`, href: `/mushaf/${page}` });
  } else if (/^\d{1,3}$/.test(query)) {
    const s = Number(query);
    if (s >= 1 && s <= 114) {
      const page = await faceOfSurah(s, db);
      if (page) mushaf.push({ label: `سورة ${s}`, sub: `وجه ص${page}`, href: `/mushaf/${page}` });
    }
  }

  return {
    students: students.map((s) => ({ label: s.user.nameAsInId, sub: "طالب — خريطة الضعف", href: `/admin/students/${s.id}/weakness` })),
    circles: circles.map((c) => ({ label: c.nameAr, sub: "حلقة — خريطة الضعف", href: `/admin/circles/${c.id}/weakness` })),
    mushaf,
  };
}
