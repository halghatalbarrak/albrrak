// منطق ورد التثبيت النقيّ (§١٢) — بلا قاعدةٍ ولا تواريخ. يحسب حصص الورد بأجزاءٍ كاملة على حدود
// الأجزاء (JuzBound من HizbBoundary)، وقِصَر آخر يوم، وموضع الورد في درجة التثبيت، وتركيب يوم
// العرض بمؤشّر التعويض (تعديل محمد ١). المحرّك المؤرَّخ (الأحداث/التواريخ) يبني فوقه في ت٣.

import type { JuzBound } from "./juz-from-hizb";

export interface AyahBound { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
export interface WardSlot { fromJuz: number; toJuz: number }
/** موضع وردٍ في درجة: رقم الختمة داخل الدرجة (٠..) واليوم داخل الختمة (٠..) وأجزاؤه. */
export interface WardLocation extends WardSlot { khatmaIndex: number; dayIndex: number }

const TOTAL_JUZ = 30;

/**
 * عدد أجزاء كلّ يومٍ في ختمةٍ بمقدار `dailyJuz` جزءاً: أيّامٌ كاملةٌ ثمّ يومٌ أخيرٌ أقصر إن لم يقسِم
 * المقدارُ الثلاثين قسمةً تامّة (§١٢: ٤ أجزاء ⟵ ٧ أيّام × ٤ ثمّ يومٌ بجزأين).
 */
export function wardDayLengths(dailyJuz: number, total: number = TOTAL_JUZ): number[] {
  if (!Number.isInteger(dailyJuz) || dailyJuz < 1) throw new Error("مقدار الورد اليوميّ عددٌ موجب.");
  const out: number[] = [];
  let remaining = total;
  while (remaining > 0) { const take = Math.min(dailyJuz, remaining); out.push(take); remaining -= take; }
  return out;
}

/** عدد أيّام (أوراد) الختمة الواحدة بمقدار `dailyJuz`. */
export function wardsPerKhatma(dailyJuz: number, total: number = TOTAL_JUZ): number {
  return wardDayLengths(dailyJuz, total).length;
}

/** عدد أوراد درجةٍ كاملةً = أوراد الختمة × عدد ختماتها. */
export function degreeWardCount(dailyJuz: number, khatmaCount: number, total: number = TOTAL_JUZ): number {
  return wardsPerKhatma(dailyJuz, total) * khatmaCount;
}

/**
 * موضع الورد رقم `wardIndex` (٠..) في درجةٍ بمقدار `dailyJuz`: رقم ختمته ويومه فيها وأجزاؤه
 * (كلّ ختمةٍ تبدأ من الجزء ١ — الفاتحة، §١٢).
 */
export function locateWardInDegree(wardIndex: number, dailyJuz: number, total: number = TOTAL_JUZ): WardLocation {
  if (!Number.isInteger(wardIndex) || wardIndex < 0) throw new Error("مؤشّر الورد عددٌ غير سالب.");
  const lengths = wardDayLengths(dailyJuz, total);
  const perKhatma = lengths.length;
  const khatmaIndex = Math.floor(wardIndex / perKhatma);
  const dayIndex = wardIndex % perKhatma;
  let fromJuz = 1;
  for (let i = 0; i < dayIndex; i++) fromJuz += lengths[i];
  const toJuz = fromJuz + lengths[dayIndex] - 1;
  return { khatmaIndex, dayIndex, fromJuz, toJuz };
}

/** حدود آيات حصّة ورد (من بداية أوّل جزءٍ إلى نهاية آخره) من JuzBound المشتقّة من HizbBoundary. */
export function wardAyahBound(slot: WardSlot, juzBounds: readonly JuzBound[]): AyahBound {
  const from = juzBounds.find((j) => j.juz === slot.fromJuz);
  const to = juzBounds.find((j) => j.juz === slot.toJuz);
  if (!from || !to) throw new Error(`لا حدودَ للجزأين ${slot.fromJuz}..${slot.toJuz}`);
  return { fromSurah: from.startSurah, fromAyah: from.startAyah, toSurah: to.endSurah, toAyah: to.endAyah };
}

/**
 * أوراد يوم العرض بمؤشّر التعويض (تعديل محمد ١): `done` = الأوراد المُتمّة (المؤشّر)، `due` =
 * المتوقّع إتمامه حتى اليوم. يُعرض **الفائت أوّلاً ثمّ ورد اليوم**، ولا يُعرض أكثر من وردٍ فائتٍ
 * واحد (سقفٌ وردان). يعيد مؤشّرات الأوراد (٠..) المطلوبة اليوم، الأقدم أوّلاً.
 */
export function composeDayWards(done: number, due: number): number[] {
  const pending = due - done;
  if (pending <= 0) return [];
  const count = Math.min(2, pending); // سقف: ورد فائتٌ واحدٌ + ورد اليوم
  return Array.from({ length: count }, (_, i) => done + i);
}
