import { describe, expect, it } from "vitest";

import { computeStreak, mergeProgramDays, type DayMark, type DayStatus } from "../gamification/streak";

// ل٢ (§٤): دوالّ السلسلة النقيّة. العذر يجسُر، القضاء (=COMPLETE) يحفظ، التقصير يقطع، الجاري محايد.

const marks = (seq: [string, DayStatus][]): DayMark[] => seq.map(([date, status]) => ({ date, status }));
const d = (n: number) => `2026-05-${String(n).padStart(2, "0")}`;

describe("computeStreak — الحاليّة والأطول", () => {
  it("تتابعٌ بسيط: ثلاثة أيّام إتمام", () => {
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "COMPLETE"]]))).toEqual({ current: 3, longest: 3 });
  });

  it("العذر لا يقطع ولا يزيد (يجسُر)", () => {
    // C E C ⟵ الأطول ٢ (مجسورة)، والحاليّة ٢ (العذر الأخير محايد لو كان آخراً)
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "EXCUSED"], [d(3), "COMPLETE"]]))).toEqual({ current: 2, longest: 2 });
    // عذرٌ في الآخر: الحاليّة تبقى ٢ (لا تزيد بالعذر)
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "EXCUSED"]]))).toEqual({ current: 2, longest: 2 });
  });

  it("القضاء يحفظها (يُخطَّط COMPLETE)", () => {
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "COMPLETE"]])).current).toBe(3);
  });

  it("التقصير يقطعها", () => {
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "SHORTFALL"], [d(4), "COMPLETE"]])))
      .toEqual({ current: 1, longest: 2 });
  });

  it("الجاري (اليوم) محايدٌ: لا يقطع ولا يزيد", () => {
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "OPEN"]]))).toEqual({ current: 2, longest: 2 });
  });

  it("الأطول عبر تقصيرٍ وسطيّ", () => {
    expect(computeStreak(marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "COMPLETE"], [d(4), "SHORTFALL"], [d(5), "COMPLETE"], [d(6), "COMPLETE"]])))
      .toEqual({ current: 2, longest: 3 });
  });

  it("فجوةٌ تقويميّة (يومٌ غير عاملٍ غير مُصدَر) لا تقطع", () => {
    // الاثنين والأربعاء إتمام، الثلاثاء إجازةٌ لم تُصدَر ⟵ سلسلة ٢
    expect(computeStreak(marks([[d(4), "COMPLETE"], [d(6), "COMPLETE"]]))).toEqual({ current: 2, longest: 2 });
  });

  it("لا علامات ⟵ صفر", () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0 });
  });
});

describe("mergeProgramDays — جمع البرامج (AND، §٤)", () => {
  it("كلاهما إتمام ⟵ إتمام", () => {
    const m = mergeProgramDays([marks([[d(1), "COMPLETE"]]), marks([[d(1), "COMPLETE"]])]);
    expect(m).toEqual([{ date: d(1), status: "COMPLETE" }]);
  });

  it("أحدهما جارٍ ⟵ جارٍ (لم يكتمل اليوم بعد)", () => {
    const m = mergeProgramDays([marks([[d(1), "COMPLETE"]]), marks([[d(1), "OPEN"]])]);
    expect(m[0].status).toBe("OPEN");
  });

  it("أحدهما تقصير ⟵ تقصير (يقطع)", () => {
    const m = mergeProgramDays([marks([[d(1), "COMPLETE"]]), marks([[d(1), "SHORTFALL"]])]);
    expect(m[0].status).toBe("SHORTFALL");
  });

  it("إتمامٌ وعذر ⟵ إتمام (المعذور يُتخطّى)", () => {
    const m = mergeProgramDays([marks([[d(1), "COMPLETE"]]), marks([[d(1), "EXCUSED"]])]);
    expect(m[0].status).toBe("COMPLETE");
  });

  it("كلّها عذر ⟵ عذر؛ وبرنامجٌ غائبٌ ذلك اليوم يُتخطّى", () => {
    const both = mergeProgramDays([marks([[d(1), "EXCUSED"]]), marks([[d(1), "EXCUSED"]])]);
    expect(both[0].status).toBe("EXCUSED");
    // اليوم ٢: البرنامج الأوّل فقط حاضرٌ (مُتمّ)، الثاني غائب (غير عامل) ⟵ إتمام
    const one = mergeProgramDays([marks([[d(2), "COMPLETE"]]), marks([[d(1), "COMPLETE"]])]);
    expect(one.find((x) => x.date === d(2))?.status).toBe("COMPLETE");
  });

  it("الدمج ثمّ الحساب: برنامجان، يومٌ ثالثٌ جارٍ ⟵ الحاليّة ٢", () => {
    const merged = mergeProgramDays([
      marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "COMPLETE"]]),
      marks([[d(1), "COMPLETE"], [d(2), "COMPLETE"], [d(3), "OPEN"]]),
    ]);
    expect(computeStreak(merged)).toEqual({ current: 2, longest: 2 });
  });
});
