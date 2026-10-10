// ═══════════════ السلسلة 🔥 — دوالّ نقيّة (ل٢، §٤) ═══════════════
//
// السلسلة **محسوبةٌ لا مخزّنة**: اشتقاقٌ من حالات الأيّام القائمة لكلّ برنامج (مصدرٌ واحد، بلا
// مصدرٍ ثانٍ يتعارض). هذه الطبقة نقيّةٌ بلا قاعدة: المحوّلات (ل٣) تُنتج علامات الأيّام، وهذه
// الدوالّ تدمجها عبر البرامج وتحسب السلسلة. القواعد (§٤):
//   • إتمام اليوم يزيدها. • العذر لا يقطعها ولا يزيدها (يجسُر). • القضاء يحفظها (= إتمام).
//   • التقصير يقطعها. • اليوم الجاري (OPEN) محايدٌ لا يقطع ولا يزيد.
//   • البرامج التي ليس لها يومٌ يوميّ: المحوّل لا يُصدر علامةً لأيّامها غير العاملة (فلا تقطع).
//   • جمع برنامجين: اليوم مُتمٌّ متى أُتمّ ما عليه في كلّ برامجه (AND)، والمعذور/غير العامل يُتخطّى.

/** حالة يومٍ لبرنامجٍ واحد. القضاء يُخطَّط إلى COMPLETE والانتظار إلى OPEN في المحوّل (ل٣). */
export type DayStatus = "COMPLETE" | "EXCUSED" | "SHORTFALL" | "OPEN";

export interface DayMark { date: string; status: DayStatus }

/**
 * يدمج علامات برامج الطالب في علامةٍ واحدة لكلّ يوم (AND عبر البرامج، §٤):
 *   • SHORTFALL في أيّ برنامجٍ حاضرٍ ذلك اليوم ⟵ SHORTFALL (يقطع).
 *   • وإلّا OPEN إن كان أيٌّ منها جارياً (لم يكتمل اليوم بعد).
 *   • وإلّا COMPLETE إن أتمّ واحدٌ على الأقلّ والباقي إتمامٌ أو عذر.
 *   • وإلّا (كلّها عذر) ⟵ EXCUSED (يجسُر).
 *   • يومٌ لا برنامجَ حاضرٌ فيه (كلّها غير عاملة) ⟵ لا علامة (يُتخطّى).
 * برنامجٌ لا علامةَ له في يومٍ = غير عاملٍ ذلك اليوم (يُتخطّى، لا يقطع).
 */
export function mergeProgramDays(programs: readonly (readonly DayMark[])[]): DayMark[] {
  const byDate = new Map<string, DayStatus[]>();
  for (const prog of programs) {
    for (const m of prog) {
      const arr = byDate.get(m.date) ?? [];
      arr.push(m.status);
      byDate.set(m.date, arr);
    }
  }
  const out: DayMark[] = [];
  for (const [date, statuses] of byDate) {
    if (statuses.some((s) => s === "SHORTFALL")) out.push({ date, status: "SHORTFALL" });
    else if (statuses.some((s) => s === "OPEN")) out.push({ date, status: "OPEN" });
    else if (statuses.some((s) => s === "COMPLETE")) out.push({ date, status: "COMPLETE" });
    else out.push({ date, status: "EXCUSED" }); // كلّها عذر
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface StreakResult { current: number; longest: number }

/**
 * يحسب السلسلة الحاليّة والأطول من علاماتٍ مرتّبةٍ زمنيّاً (تُرتَّب داخليّاً بالتاريخ). الفجوات
 * التقويميّة لا تُهمّ: القائمة أيّامُ العمل فقط (غير العاملة لا يُصدرها المحوّل).
 *   • الحاليّة: من الأحدث رجوعاً — OPEN/EXCUSED محايدان (يُتخطّيان)، COMPLETE يزيد، SHORTFALL يقف.
 *   • الأطول: أطول تتابع COMPLETE، يجسُره العذر والجاري، ويقطعه التقصير.
 */
export function computeStreak(marks: readonly DayMark[]): StreakResult {
  const sorted = [...marks].sort((a, b) => a.date.localeCompare(b.date));

  // الحاليّة: من الأحدث رجوعاً.
  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i].status;
    if (s === "OPEN" || s === "EXCUSED") continue; // محايد — يجسُر
    if (s === "COMPLETE") { current++; continue; }
    break; // SHORTFALL — يقطع
  }

  // الأطول: أطول تتابع إتمامٍ (العذر/الجاري يجسُران، التقصير يقطع).
  let longest = 0, run = 0;
  for (const m of sorted) {
    if (m.status === "COMPLETE") { run++; if (run > longest) longest = run; }
    else if (m.status === "SHORTFALL") run = 0;
    // OPEN/EXCUSED: محايد — لا يزيد ولا يقطع
  }

  return { current, longest };
}
