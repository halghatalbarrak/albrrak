// اشتقاق الأوجه وحدود المراحل من بيانات المصحف (§١، §٤٫١). الحفظ تصاعديّ بترتيب المصحف من
// الفاتحة (صفحة ١) إلى الناس (صفحة ٦٠٤). لا أرقام صفحاتٍ ولا حدود أجزاءٍ مكتوبةٌ يدويّاً:
// الأوجه من MushafFace، وحدود المراحل من حدود الأجزاء المشتقّة من HizbBoundary (juzBoundsFromHizb)
// مُسقَطةً على الأوجه — تُمرَّر كمُدخل، ولا ثابتَ مكتوبٌ هنا.

import type { JuzBound } from "./juz-from-hizb";

/** وجهٌ من المصحف (MushafFace): الصفحة ومدى آياتها. */
export interface MushafFaceData {
  page: number;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

/** حدود مرحلةٍ مشتقّةٌ من الأجزاء، بصفحاتها وآياتها. */
export interface StageBound {
  stage: number; // ١..n
  startJuz: number;
  endJuz: number;
  startPage: number;
  endPage: number;
}

/** مقارنة موضعَي (سورة، آية) بترتيب المصحف. */
const cmp = (s1: number, a1: number, s2: number, a2: number): number => s1 - s2 || a1 - a2;

/** صفحات الأوجه مرتّبةً تصاعديّاً (بترتيب المصحف). */
function sortedPages(faces: readonly MushafFaceData[]): number[] {
  return faces.map((f) => f.page).sort((a, b) => a - b);
}

/**
 * الأوجه الجديدة ليومٍ بحسب المسار (§٤٫١): يُرجع الصفحات الـ`track` التالية بعد `lastPage`
 * بترتيب المصحف (المسار ١|٢|٣ = عدد الأوجه يوميّاً). يتوقّف عند آخر صفحةٍ متاحة في المصحف.
 * `lastPage = 0` يعني لم يُحفظ بعد ⟵ يبدأ من الصفحة الأولى.
 */
export function newFacesForDay(lastPage: number, track: number, faces: readonly MushafFaceData[]): number[] {
  const pages = sortedPages(faces);
  const startIdx = pages.findIndex((p) => p > lastPage);
  if (startIdx === -1) return []; // لا جديدَ بعد آخر المصحف
  return pages.slice(startIdx, startIdx + track);
}

/** صفحة الوجه التي يقع فيها موضع (سورة، آية) بترتيب المصحف. */
export function pageContaining(faces: readonly MushafFaceData[], surah: number, ayah: number): number {
  const ordered = [...faces].sort((a, b) => a.page - b.page);
  for (const f of ordered) {
    const afterStart = cmp(surah, ayah, f.fromSurah, f.fromAyah) >= 0;
    const beforeEnd = cmp(surah, ayah, f.toSurah, f.toAyah) <= 0;
    if (afterStart && beforeEnd) return f.page;
  }
  // قبل أوّل وجهٍ ⟵ الأوّل؛ بعد آخر وجهٍ ⟵ الأخير (حِفظاً للحدّ).
  if (cmp(surah, ayah, ordered[0].fromSurah, ordered[0].fromAyah) < 0) return ordered[0].page;
  return ordered[ordered.length - 1].page;
}

/** رقم الجزء الذي يقع فيه موضع (سورة، آية) من حدود الأجزاء. */
function juzOfAyah(juzBounds: readonly JuzBound[], surah: number, ayah: number): number {
  const hit = juzBounds.find(
    (j) => cmp(surah, ayah, j.startSurah, j.startAyah) >= 0 && cmp(surah, ayah, j.endSurah, j.endAyah) <= 0,
  );
  if (!hit) throw new Error(`الموضع ${surah}:${ayah} خارج حدود الأجزاء`);
  return hit.juz;
}

/**
 * حدود المراحل **بالصفحات** (§١): كل مرحلة `stageJuzCount` أجزاء (افتراضيّ ٥ ⟵ ٦ مراحل). وبما أنّ
 * المدّكر يحفظ بالأوجه (صفحاتٍ كاملة)، تُنسَب كلُّ صفحةٍ للمرحلة التي يقع فيها جزءُ **أوّل آيةٍ فيها**؛
 * فالصفحة المقسومة بين جزأين تتبع المرحلة السابقة (قرار §١). حدود الأجزاء من HizbBoundary، والأوجه
 * من MushafFace — كلاهما مُدخل، لا ثابتَ مكتوب.
 */
export function deriveStages(
  faces: readonly MushafFaceData[],
  stageJuzCount: number,
  juzBounds: readonly JuzBound[],
): StageBound[] {
  if (stageJuzCount < 1) throw new Error("stageJuzCount يجب أن يكون ١ فأكثر");
  const totalJuz = juzBounds.length;
  const stageCount = Math.ceil(totalJuz / stageJuzCount);
  const stageOfJuz = (juz: number): number => Math.floor((juz - 1) / stageJuzCount) + 1;

  // تُنسَب كل صفحةٍ لمرحلةٍ بجزء أوّل آيتها، فتتجمّع حدود الصفحات لكل مرحلة.
  const ranges = new Map<number, { startPage: number; endPage: number }>();
  for (const f of [...faces].sort((a, b) => a.page - b.page)) {
    const stage = stageOfJuz(juzOfAyah(juzBounds, f.fromSurah, f.fromAyah));
    const cur = ranges.get(stage);
    if (!cur) ranges.set(stage, { startPage: f.page, endPage: f.page });
    else { cur.startPage = Math.min(cur.startPage, f.page); cur.endPage = Math.max(cur.endPage, f.page); }
  }

  const stages: StageBound[] = [];
  for (let s = 1; s <= stageCount; s++) {
    const r = ranges.get(s);
    if (!r) throw new Error(`المرحلة ${s} بلا صفحات — بيانات المصحف لا تغطّي أجزاءها`);
    stages.push({
      stage: s,
      startJuz: (s - 1) * stageJuzCount + 1,
      endJuz: Math.min(s * stageJuzCount, totalJuz),
      startPage: r.startPage,
      endPage: r.endPage,
    });
  }
  return stages;
}

/** رقم المرحلة التي تقع فيها صفحةٌ ما (أو null إن خرجت عن كل الحدود). */
export function stageForPage(stages: readonly StageBound[], page: number): number | null {
  const hit = stages.find((s) => page >= s.startPage && page <= s.endPage);
  return hit ? hit.stage : null;
}
