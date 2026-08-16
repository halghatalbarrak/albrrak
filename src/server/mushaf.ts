import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { ayahOrdinal, SURAH_AYAH_COUNTS } from "./quran-ordinal";
import { ValidationError } from "./errors";

// ═══════════════ أوجه المصحف (الحكم ٧) ═══════════════
//
// مساعدٌ يربط مدًى (سورة/آية) بأوجه MushafFace المتقاطعة معه — يخدم التحقّق من أن الأخطاء
// والتردّد وقعت في أوجه النطاق المُختبَر فعلًا (يحمي صحّة العدّ).

export interface AyahRange {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

/** أرقام أوجه (صفحات) MushafFace المتقاطعة مع المدى المُعطى. فارغةٌ إن لم تُبذَر الخريطة. */
export async function facePagesInRange(
  range: AyahRange,
  db: PrismaClient = prisma,
): Promise<Set<number>> {
  const lo = ayahOrdinal(range.fromSurah, range.fromAyah);
  const hi = ayahOrdinal(range.toSurah, range.toAyah);
  const faces = await db.mushafFace.findMany({
    select: { page: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true },
  });
  const set = new Set<number>();
  for (const f of faces) {
    const a = ayahOrdinal(f.fromSurah, f.fromAyah);
    const z = ayahOrdinal(f.toSurah, f.toAyah);
    if (a <= hi && z >= lo) set.add(f.page); // تقاطع
  }
  return set;
}

// ═══════════════ عرض الوجه (الحكم ٧، المرحلة ٤) ═══════════════

export interface FaceView {
  page: number;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  ayahs: { surah: number; ayah: number }[]; // كل آيات الوجه (من MushafFace)
  imageUrl: string; // صورة الوجه (WebP، مرسومةٌ من quran-svg — دقّة منخفضة)
  polygonsUrl: string; // مضلّعات آيات الوجه (JSON، من quran-svg) — لتظليل آيةٍ بعينها
  polygonViewBox: { width: number; height: number }; // فضاء المضلّعات (يُقاس عليه التظليل)
}

// فضاء مضلّعات quran-svg (viewBox الأصليّ) — التظليل يُقاس بنسبة عرض الصورة إليه.
const POLYGON_VIEWBOX = { width: 345, height: 550 };

/**
 * عرض الوجه: رابط صورته (WebP) ومضلّعات آياته (JSON من quran-svg) وقائمة آياته المشتقّة من
 * MushafFace (الحكم ٧). قاعدة الروابط من MUSHAF_ASSETS_BASE. الصورة والمضلّعات من طبعةٍ
 * واحدة (١٤٤١)، فالتظليل ينطبق بتكبيرٍ خالصٍ بلا معايرة. يُستعمل في شاشة الحصاد.
 */
export async function getFace(page: number, db: PrismaClient = prisma): Promise<FaceView> {
  const f = await db.mushafFace.findUnique({ where: { page } });
  if (!f) throw new ValidationError(`وجهٌ غير موجود: ${page}.`);

  const ayahs: { surah: number; ayah: number }[] = [];
  for (let s = f.fromSurah; s <= f.toSurah; s++) {
    const a0 = s === f.fromSurah ? f.fromAyah : 1;
    const a1 = s === f.toSurah ? f.toAyah : SURAH_AYAH_COUNTS[s];
    for (let a = a0; a <= a1; a++) ayahs.push({ surah: s, ayah: a });
  }

  const base = process.env.MUSHAF_ASSETS_BASE ?? "";
  const n = String(page).padStart(3, "0");
  return {
    page: f.page,
    fromSurah: f.fromSurah, fromAyah: f.fromAyah, toSurah: f.toSurah, toAyah: f.toAyah,
    ayahs,
    imageUrl: `${base}/${n}.webp`,
    polygonsUrl: `${base}/${n}.json`,
    polygonViewBox: POLYGON_VIEWBOX,
  };
}
