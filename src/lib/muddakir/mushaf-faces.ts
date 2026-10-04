// اشتقاق الأوجه وحدود المراحل من بيانات المصحف (§١، §٤٫١). الحفظ تصاعديّ بترتيب المصحف من
// الفاتحة (صفحة ١) إلى الناس (صفحة ٦٠٤). لا أرقام صفحاتٍ ولا حدود أجزاءٍ مكتوبةٌ يدويّاً:
// الأوجه من MushafFace، وحدود المراحل من JUZ_BOUNDS (المصدر الموقَّع) مُسقَطةً على الأوجه.

import { JUZ_BOUNDS, type JuzBound } from "../juz-bounds";

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

/**
 * حدود المراحل مشتقّةً من الأجزاء (§١): كل مرحلة `stageJuzCount` أجزاء (افتراضيّ ٥ ⟵ ٦ مراحل)،
 * على حدود الأجزاء كما هي. بداية/نهاية كل مرحلةٍ تُسقَط على صفحات الأوجه من بيانات المصحف.
 * `juzBounds` افتراضُه المصدر الموقَّع JUZ_BOUNDS، ويُمرَّر صراحةً في الاختبار.
 */
export function deriveStages(
  faces: readonly MushafFaceData[],
  stageJuzCount: number,
  juzBounds: readonly JuzBound[] = JUZ_BOUNDS,
): StageBound[] {
  if (stageJuzCount < 1) throw new Error("stageJuzCount يجب أن يكون ١ فأكثر");
  const sorted = [...juzBounds].sort((a, b) => a.juz - b.juz);
  const stages: StageBound[] = [];
  for (let i = 0; i < sorted.length; i += stageJuzCount) {
    const group = sorted.slice(i, i + stageJuzCount);
    const first = group[0];
    const last = group[group.length - 1];
    stages.push({
      stage: stages.length + 1,
      startJuz: first.juz,
      endJuz: last.juz,
      startPage: pageContaining(faces, first.startSurah, first.startAyah),
      endPage: pageContaining(faces, last.endSurah, last.endAyah),
    });
  }
  return stages;
}

/** رقم المرحلة التي تقع فيها صفحةٌ ما (أو null إن خرجت عن كل الحدود). */
export function stageForPage(stages: readonly StageBound[], page: number): number | null {
  const hit = stages.find((s) => page >= s.startPage && page <= s.endPage);
  return hit ? hit.stage : null;
}
