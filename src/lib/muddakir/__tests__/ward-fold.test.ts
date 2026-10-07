import { describe, expect, it } from "vitest";

import { foldWardDays, type WardDayEntry } from "../ward-fold";
import { locateInLadder, type LadderDegree } from "../ward";

// ت٣ (§١٢ + تعديل ١): طيّ أيّام الورد زمنيّاً بمؤشّر التعويض، وإسقاط المؤشّر على السلّم.

const e = (dayDate: string, completed: number, excused = false, open = false): WardDayEntry => ({ dayDate, completed, excused, open });

describe("foldWardDays — مؤشّر التعويض (الحالات الثلاث، تعديل ١)", () => {
  // يومٌ أوّلُ فائتٌ (completed=0) ⟵ الغد يُعرض فيه وردان (shown=2).
  it("أتمّ الوردين ⟵ المؤشّر +٢ والجدول في موعده (MADE_UP)", () => {
    const f = foldWardDays([e("2026-06-01", 0), e("2026-06-02", 2)]);
    expect(f.days[1]).toMatchObject({ shown: 2, completed: 2, carryOut: 0, pointerAfter: 2, status: "MADE_UP" });
    expect(f.carry).toBe(0);
  });
  it("أتمّ وِرداً واحداً ⟵ المؤشّر +١ والجدول يتأخّر (carry=١)", () => {
    const f = foldWardDays([e("2026-06-01", 0), e("2026-06-02", 1)]);
    expect(f.days[1]).toMatchObject({ shown: 2, completed: 1, carryOut: 1, pointerAfter: 1, status: "COMPLETE" });
    expect(f.carry).toBe(1);
  });
  it("لم يُتمّ شيئاً ⟵ المؤشّر ثابتٌ وتقصيرٌ والجدول يتأخّر", () => {
    const f = foldWardDays([e("2026-06-01", 0), e("2026-06-02", 0)]);
    expect(f.days[1]).toMatchObject({ shown: 2, completed: 0, carryOut: 1, pointerAfter: 0, status: "SHORTFALL" });
  });
});

describe("foldWardDays — حالاتٌ أخرى", () => {
  it("أيّامٌ منتظمة: ورد اليوم يُتمّ كلّ يوم، بلا تأخّر", () => {
    const f = foldWardDays([e("2026-06-01", 1), e("2026-06-02", 1), e("2026-06-03", 1)]);
    expect(f.pointer).toBe(3);
    expect(f.days.every((d) => d.status === "COMPLETE" && d.carryOut === 0)).toBe(true);
  });
  it("عذرٌ بلا إتمام ⟵ EXCUSED (لا تقصير)، والورد لا يسقط (carry=١)", () => {
    const f = foldWardDays([e("2026-06-01", 0, true)]);
    expect(f.days[0]).toMatchObject({ status: "EXCUSED", carryOut: 1, pointerAfter: 0 });
  });
  it("لا يُعرض أكثر من فائتٍ واحد (سقف shown=٢) ولو تعدّد الفوات", () => {
    const f = foldWardDays([e("2026-06-01", 0), e("2026-06-02", 0), e("2026-06-03", 0)]);
    expect(f.days.every((d) => d.shown <= 2)).toBe(true);
    expect(f.carry).toBe(1);
  });
  it("اليوم الجاري (open) بلا إتمامٍ كافٍ ⟵ OPEN لا تقصير", () => {
    const f = foldWardDays([e("2026-06-01", 0, false, true)]);
    expect(f.days[0].status).toBe("OPEN");
  });
});

describe("locateInLadder — إسقاط المؤشّر على السلّم", () => {
  const ladder: LadderDegree[] = [{ degreeNo: 1, dailyJuz: 1, khatmaCount: 3 }, { degreeNo: 2, dailyJuz: 2, khatmaCount: 2 }];
  // الدرجة ١: ٣٠ وردٍ/ختمة × ٣ = ٩٠. الدرجة ٢: ١٥ × ٢ = ٣٠.
  it("يحدّد الدرجة والختمة داخلها", () => {
    expect(locateInLadder(0, ladder)).toMatchObject({ done: false, degreeNo: 1, wardInDegree: 0, khatmaInDegree: 0 });
    expect(locateInLadder(30, ladder)).toMatchObject({ degreeNo: 1, khatmaInDegree: 1 });
    expect(locateInLadder(89, ladder)).toMatchObject({ degreeNo: 1, khatmaInDegree: 2 });
    expect(locateInLadder(90, ladder)).toMatchObject({ degreeNo: 2, wardInDegree: 0, khatmaInDegree: 0 });
    expect(locateInLadder(105, ladder)).toMatchObject({ degreeNo: 2, khatmaInDegree: 1 });
    expect(locateInLadder(120, ladder).done).toBe(true); // تجاوز السلّم
  });
});
