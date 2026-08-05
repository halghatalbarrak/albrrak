import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ═══════════════ الترسيخ والمراجعة (MARAQI_RULES الأحكام ٢، ٤، ٩) ═══════════════
//
// الحكم ٩: «المقطع» = **جلسة حفظٍ واحدة** بمستوى الطالب المتدرّج (لا وجهٌ ثابت).
// الحكم ٢: نافذة الترسيخ = **آخر ١٠ جلسات حفظ** (لا آخر ١٠ أوجه). المقطع يبقى فيها
//          حتى تُحفظ ١٠ مقاطع بعده، يُراجَع يوميًّا، ثم يخرج **راسخًا**.
// الحكم ٤: كامل الراسخ يُوزَّع على أيام الحلقة الخمسة بالتساوي (**خُمس/يوم**)، والطالب
//          حرٌّ في التعجيل، والمهم إتمام الدورة أسبوعيًّا.
//
// هذه الدفعة: حساب النافذة والراسخ والخُمس (مشتقٌّ من الجلسات — بلا حقلٍ جديد). الرصد
// عبر التسميع المرن القائم (الحكم ٦: recordTarseekh/recordMurajaah بالفاعل والمُسنَد).
// مؤجَّل (يحتاج قرار محمد ⟵ مخطط): تتبّع **إتمام الدورة الأسبوعية بالمقدار** (التعجيل).

/** الحكم ٢: عشرُ جلساتِ حفظٍ في نافذة الترسيخ. */
export const TARSEEKH_WINDOW = 10;

/** أيام الحلقة الخمسة — عليها يُوزَّع الراسخ (الحكم ٤ + ٣). */
export const CIRCLE_DAYS_PER_WEEK = 5;

export interface Segment {
  date: string; // YYYY-MM-DD ليوم حفظه
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

/**
 * مقاطع الطالب المحفوظة (جلسات حفظٍ مُتقَنة) مرتّبةً بالأقدم فالأحدث. كل جلسةٍ = مقطع
 * (الحكم ٩) — بمقدار مستواه لا بوجهٍ ثابت.
 */
async function memorizedSegments(studentId: string, db: PrismaClient): Promise<Segment[]> {
  const rows = await db.dailySession.findMany({
    where: { studentId, hifzMastered: true, hifzFromSurah: { not: null } },
    orderBy: { date: "asc" },
    select: {
      date: true,
      hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true,
    },
  });
  return rows
    .filter((r) => r.hifzFromSurah != null && r.hifzFromAyah != null && r.hifzToSurah != null && r.hifzToAyah != null)
    .map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      fromSurah: r.hifzFromSurah as number,
      fromAyah: r.hifzFromAyah as number,
      toSurah: r.hifzToSurah as number,
      toAyah: r.hifzToAyah as number,
    }));
}

export interface ConsolidationView {
  /** آخر ١٠ مقاطع — تُراجَع يوميًّا (الحكم ٢). */
  tarseekh: { windowSize: number; segments: Segment[] };
  /** الراسخ (ما خرج من النافذة) — يُوزَّع خُمسًا يوميًّا (الحكم ٤). */
  review: { stockCount: number; khums: number; segments: Segment[] };
}

/**
 * يحسب الترسيخ والمراجعة للطالب (الأحكام ٢، ٤، ٩): آخر ١٠ جلسات حفظٍ في الترسيخ،
 * وما قبلها راسخٌ يُوزَّع خُمسًا يوميًّا (⌈الراسخ ÷ ٥⌉). فارغٌ بأمان قبل أول حفظ.
 */
export async function getConsolidation(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<ConsolidationView> {
  const segs = await memorizedSegments(studentId, db);
  const cut = Math.max(0, segs.length - TARSEEKH_WINDOW);
  const inTarseekh = segs.slice(cut); // آخر ١٠ (أو أقلّ)
  const rasikh = segs.slice(0, cut); // ما قبلها

  return {
    tarseekh: { windowSize: TARSEEKH_WINDOW, segments: inTarseekh },
    review: {
      stockCount: rasikh.length,
      khums: Math.ceil(rasikh.length / CIRCLE_DAYS_PER_WEEK),
      segments: rasikh,
    },
  };
}
