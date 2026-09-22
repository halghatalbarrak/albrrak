import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { ayahOrdinal, SURAH_AYAH_COUNTS } from "./quran-ordinal";
import { ValidationError } from "./errors";

// ═══════════════ خريطة السطر↔الآية — القراءة (البند ٢، المرحلة ٢) ═══════════════
//
// طبقة قراءةٍ فوق MushafLine (المبذورة بسكربت). ثلاث دوالّ تخدم وحدات المسارات ووجهة اليوم:
//   linesForPage      — أسطر صفحةٍ بحدودها.
//   ayahsInLineRange  — آيات نطاق أسطر.
//   unitBoundsByLines — أساس الوحدة: ابدأ من موضعٍ وامتدّ عددًا من الأسطر (باتّجاه مراقي:
//                       تصاعديّ داخل السورة)، بحدود آيات، مع «الآية لا تُكسَر» وحدّ السورة.
// لا تمسّ منطق الجلسة/الحصاد — قراءةٌ فقط.

export interface LineSpan {
  lineNo: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export interface AyahBounds {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

/** آخر آية في السورة (حدٌّ أعلى داخلها). */
function surahLastAyah(surah: number): number {
  return SURAH_AYAH_COUNTS[surah] ?? 0;
}

/** يوسّع مدًى (سورة:آية → سورة:آية) إلى قائمة آياتٍ متتاليةً بترتيب المصحف. */
function expandAyahs(b: AyahBounds): { surah: number; ayah: number }[] {
  const out: { surah: number; ayah: number }[] = [];
  for (let s = b.fromSurah; s <= b.toSurah; s++) {
    const a0 = s === b.fromSurah ? b.fromAyah : 1;
    const a1 = s === b.toSurah ? b.toAyah : surahLastAyah(s);
    for (let a = a0; a <= a1; a++) out.push({ surah: s, ayah: a });
  }
  return out;
}

/** أسطر الصفحة بحدود آياتها، مرتّبةً بالسطر. */
export async function linesForPage(page: number, db: PrismaClient = prisma): Promise<LineSpan[]> {
  return db.mushafLine.findMany({
    where: { page },
    orderBy: { lineNo: "asc" },
    select: { lineNo: true, startSurah: true, startAyah: true, endSurah: true, endAyah: true },
  });
}

/**
 * آيات نطاق أسطرٍ في صفحة (fromLine..toLine): حدودها (أدنى بداية، أقصى نهاية) وقائمتها.
 * يرمي إن لم توجد أسطرٌ في النطاق (خريطةٌ غير مبذورة أو نطاقٌ خارج الصفحة).
 */
export async function ayahsInLineRange(
  page: number,
  fromLine: number,
  toLine: number,
  db: PrismaClient = prisma,
): Promise<AyahBounds & { ayahs: { surah: number; ayah: number }[] }> {
  const rows = await db.mushafLine.findMany({
    where: { page, lineNo: { gte: fromLine, lte: toLine } },
    orderBy: { lineNo: "asc" },
  });
  if (rows.length === 0) throw new ValidationError("لا أسطر في هذا النطاق (خريطةٌ غير مبذورة؟).");

  let loOrd = Infinity, hiOrd = -Infinity;
  let bounds: AyahBounds = { fromSurah: 0, fromAyah: 0, toSurah: 0, toAyah: 0 };
  for (const r of rows) {
    const o1 = ayahOrdinal(r.startSurah, r.startAyah);
    const o2 = ayahOrdinal(r.endSurah, r.endAyah);
    if (o1 < loOrd) { loOrd = o1; bounds = { ...bounds, fromSurah: r.startSurah, fromAyah: r.startAyah }; }
    if (o2 > hiOrd) { hiOrd = o2; bounds = { ...bounds, toSurah: r.endSurah, toAyah: r.endAyah }; }
  }
  return { ...bounds, ayahs: expandAyahs(bounds) };
}

/**
 * أساس الوحدة: ابدأ من موضعٍ (سورة:آية) وامتدّ lineCount سطرًا **داخل السورة** بترتيب
 * القراءة (تصاعديّ آية — وهو نزولٌ في الصفحة، اتّجاه مراقي داخل السورة). القواعد المُقرّة:
 *   • الآية لا تُكسَر: تُعاد آيةٌ كاملةٌ دائمًا (نهاية آخر آيةٍ يبلغها العدّ).
 *   • حدّ السورة: لا تتجاوز الوحدة السورةَ (كل سورةٍ تُحفظ كاملةً)؛ فإن قصُرت أسطرها انتهت
 *     الوحدة بآخر آيةٍ فيها.
 * الانتقال إلى السورة التالية (نزولًا) شأنُ حاسب الموضع، لا هذه الدالّة.
 */
export async function unitBoundsByLines(
  start: { surah: number; ayah: number },
  lineCount: number,
  db: PrismaClient = prisma,
): Promise<AyahBounds> {
  if (!Number.isInteger(lineCount) || lineCount < 1) throw new ValidationError("عدد الأسطر ≥ ١.");
  const S = start.surah;

  // أسطر السورة بترتيب القراءة (وجهٌ ثمّ سطر) = تصاعديّ آية.
  const lines = await db.mushafLine.findMany({
    where: { startSurah: { lte: S }, endSurah: { gte: S } },
    orderBy: [{ page: "asc" }, { lineNo: "asc" }],
    select: { startSurah: true, startAyah: true, endSurah: true, endAyah: true },
  });
  if (lines.length === 0) throw new ValidationError("لا خريطة أسطرٍ لهذه السورة.");

  const startOrd = ayahOrdinal(S, start.ayah);
  const ord = (s: number, a: number) => ayahOrdinal(s, a);
  const idx0 = lines.findIndex((l) => ord(l.startSurah, l.startAyah) <= startOrd && ord(l.endSurah, l.endAyah) >= startOrd);
  if (idx0 < 0) throw new ValidationError("موضعٌ خارج خريطة السورة.");

  const targetIdx = Math.min(idx0 + lineCount - 1, lines.length - 1);
  const endLine = lines[targetIdx];

  // آخر آيةٍ من السورة S يبلغها العدّ (لا نتجاوز السورة، والآية كاملة).
  const surahCap = ayahOrdinal(S, surahLastAyah(S));
  const endOrd = Math.min(ord(endLine.endSurah, endLine.endAyah), surahCap);
  const endAyah = endOrd - ayahOrdinal(S, 0); // ayahOrdinal(S,0) = مجموع ما قبل السورة

  return { fromSurah: S, fromAyah: start.ayah, toSurah: S, toAyah: endAyah };
}
