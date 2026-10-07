import { describe, expect, it } from "vitest";

import {
  wardDayLengths, wardsPerKhatma, degreeWardCount, locateWardInDegree, wardAyahBound, composeDayWards,
} from "../ward";
import type { JuzBound } from "../juz-from-hizb";

// ت٢ (§١٢): حساب ورد التثبيت النقيّ — دوالّ بلا قاعدةٍ ولا تواريخ.

// سلّم §١٢: المقدار اليوميّ ← أيّام الختمة (⌈٣٠ ÷ المقدار⌉).
const KHATMA_DAYS: [number, number][] = [
  [1, 30], [2, 15], [3, 10], [4, 8], [5, 6], [6, 5], [7, 5], [8, 4], [9, 4], [10, 3],
];

describe("wardDayLengths / wardsPerKhatma — قِصَر آخر يوم (§١٢)", () => {
  it("يقسّم ٣٠ جزءاً، وآخر يومٍ أقصر عند عدم القسمة التامّة", () => {
    expect(wardDayLengths(1)).toEqual(Array(30).fill(1));
    expect(wardDayLengths(2)).toEqual(Array(15).fill(2));
    expect(wardDayLengths(4)).toEqual([4, 4, 4, 4, 4, 4, 4, 2]); // ٧×٤ ثمّ ٢
    expect(wardDayLengths(7)).toEqual([7, 7, 7, 7, 2]); // ٤×٧ ثمّ ٢
    expect(wardDayLengths(10)).toEqual([10, 10, 10]);
  });

  it("أيّام الختمة تطابق جدول §١٢ لكلّ الدرجات", () => {
    for (const [daily, days] of KHATMA_DAYS) expect(wardsPerKhatma(daily), `${daily} جزء/يوم`).toBe(days);
  });

  it("عدد أوراد الدرجة = أيّام الختمة × عدد الختمات", () => {
    expect(degreeWardCount(1, 3)).toBe(90); // الدرجة ١: ٣٠ يوم × ٣ ختمات
    expect(degreeWardCount(10, 10)).toBe(30); // الدرجة ١٠: ٣ أيّام × ١٠
    expect(degreeWardCount(4, 4)).toBe(32); // الدرجة ٤: ٨ × ٤
  });
});

describe("locateWardInDegree — موضع الورد وأجزاؤه (كلّ ختمةٍ من الفاتحة)", () => {
  it("مقدار ٤: أوّل يومٍ ١..٤، آخر يومٍ ٢٩..٣٠، ثمّ ختمةٌ جديدة من ١", () => {
    expect(locateWardInDegree(0, 4)).toMatchObject({ khatmaIndex: 0, dayIndex: 0, fromJuz: 1, toJuz: 4 });
    expect(locateWardInDegree(6, 4)).toMatchObject({ dayIndex: 6, fromJuz: 25, toJuz: 28 });
    expect(locateWardInDegree(7, 4)).toMatchObject({ khatmaIndex: 0, dayIndex: 7, fromJuz: 29, toJuz: 30 }); // اليوم القصير
    expect(locateWardInDegree(8, 4)).toMatchObject({ khatmaIndex: 1, dayIndex: 0, fromJuz: 1, toJuz: 4 }); // ختمةٌ جديدة
  });
  it("مقدار ١: كلّ يومٍ جزءٌ واحد", () => {
    expect(locateWardInDegree(0, 1)).toMatchObject({ fromJuz: 1, toJuz: 1 });
    expect(locateWardInDegree(29, 1)).toMatchObject({ khatmaIndex: 0, dayIndex: 29, fromJuz: 30, toJuz: 30 });
    expect(locateWardInDegree(30, 1)).toMatchObject({ khatmaIndex: 1, dayIndex: 0, fromJuz: 1, toJuz: 1 });
  });
});

describe("wardAyahBound — حدود الآيات من حدود الأجزاء", () => {
  const juzBounds: JuzBound[] = Array.from({ length: 30 }, (_, i) => ({
    juz: i + 1, startSurah: i + 1, startAyah: 1, endSurah: i + 1, endAyah: 10,
  }));
  it("من بداية أوّل جزءٍ إلى نهاية آخره", () => {
    expect(wardAyahBound({ fromJuz: 1, toJuz: 4 }, juzBounds)).toEqual({ fromSurah: 1, fromAyah: 1, toSurah: 4, toAyah: 10 });
    expect(wardAyahBound({ fromJuz: 29, toJuz: 30 }, juzBounds)).toEqual({ fromSurah: 29, fromAyah: 1, toSurah: 30, toAyah: 10 });
  });
});

describe("composeDayWards — مؤشّر التعويض (تعديل ١)", () => {
  it("يومٌ عاديّ: ورد اليوم وحده", () => {
    expect(composeDayWards(5, 6)).toEqual([5]);
  });
  it("فائتٌ أمس: الفائت أوّلاً ثمّ ورد اليوم (وردان)", () => {
    expect(composeDayWards(5, 7)).toEqual([5, 6]);
  });
  it("لا يُعرض أكثر من فائتٍ واحد (سقف وردين)", () => {
    expect(composeDayWards(5, 9)).toEqual([5, 6]); // رغم تأخّرٍ أكبر
  });
  it("لا شيء مستحقٌّ ⟵ فارغ", () => {
    expect(composeDayWards(5, 5)).toEqual([]);
    expect(composeDayWards(5, 4)).toEqual([]);
  });
});
