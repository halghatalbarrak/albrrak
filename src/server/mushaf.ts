import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { ayahOrdinal } from "./quran-ordinal";

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
