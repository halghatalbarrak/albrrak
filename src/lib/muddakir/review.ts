// توزيع المراجعة (§٤٫٣): ختمةٌ للأوجه التي في المراجعة، تُقسَم على أيّام الدورة (٧ افتراضاً ⚙،
// يعدّلها المشرف لكل حافظ) بترتيب المصحف. تُرجع شريحة اليوم المطلوب. كل الأرقام من Setting/الملفّ.

import { epochDay } from "./makkah-day";

/** وجهٌ في المراجعة — يلزم رقم صفحته للترتيب والتقسيم. */
export interface ReviewFaceInput {
  page: number;
}

/** تقسيمٌ متتابعٌ متوازنٌ لمصفوفةٍ إلى `parts` شرائح (الأُولى تأخذ الكسر الزائد). */
function evenChunks<T>(items: readonly T[], parts: number): T[][] {
  const base = Math.floor(items.length / parts);
  const rem = items.length % parts;
  const out: T[][] = [];
  let i = 0;
  for (let k = 0; k < parts; k++) {
    const size = base + (k < rem ? 1 : 0);
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

/**
 * شريحة مراجعة اليوم: تُرتَّب أوجه المراجعة بترتيب المصحف، وتُقسَم على `cycleDays` شريحةً،
 * وتُختار شريحة اليوم بدوران رقم اليوم القرآنيّ على طول الدورة — فتكتمل الختمة كل `cycleDays`.
 * @param reviewFaces الأوجه التي في المراجعة.
 * @param cycleDays عدد أيّام الدورة (من الملفّ/Setting).
 * @param today اليوم القرآنيّ (YYYY-MM-DD بتوقيت مكّة).
 */
export function reviewSliceForDay(
  reviewFaces: readonly ReviewFaceInput[],
  cycleDays: number,
  today: string,
): ReviewFaceInput[] {
  if (cycleDays < 1) throw new Error("cycleDays يجب أن يكون ١ فأكثر");
  if (reviewFaces.length === 0) return [];
  const ordered = [...reviewFaces].sort((a, b) => a.page - b.page);
  const chunks = evenChunks(ordered, cycleDays);
  const dayIndex = ((epochDay(today) % cycleDays) + cycleDays) % cycleDays;
  return chunks[dayIndex];
}
