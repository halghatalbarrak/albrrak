import { describe, expect, it } from "vitest";

import { ribatWindow } from "../ribat";
import type { FaceStateInput } from "../types";

// نافذة الربط بحسب المسار من Setting (§٩): وجه=٢٠، وجهان=١٥، ثلاثة=١٠.
const WINDOW = { "1": 20, "2": 15, "3": 10 };
const TODAY = "2026-10-21";
const minus = (days: number): string =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const face = (page: number, ageDays: number, state: FaceStateInput["state"], heard: boolean): FaceStateInput => ({
  page,
  state,
  heard,
  firstMemorizedOn: minus(ageDays),
});

describe("ribatWindow — المسار ١ (نافذة ٢٠)", () => {
  it("يستبعد اليوم والأمس، ويضمّ ما بين عمرَي ٢ والنافذة، ويرتّب بترتيب المصحف", () => {
    const faces: FaceStateInput[] = [
      face(1, 40, "IN_REVIEW", true), // خرج إلى المراجعة ⟵ مستبعَد
      face(14, 0, "NEW", false), // اليوم (الجديد) ⟵ مستبعَد
      face(13, 1, "IN_RIBAT", false), // الأمس (تكرار الأمس) ⟵ مستبعَد
      face(10, 20, "HEARD", true), // على حدّ النافذة، مسموع ⟵ مضموم
      face(5, 3, "IN_RIBAT", false), // داخل النافذة ⟵ مضموم
      { page: 99, state: "NEW", heard: false, firstMemorizedOn: null }, // لم يُحفظ ⟵ مستبعَد
    ];
    expect(ribatWindow({ track: 1, reviewCycleDays: 7 }, faces, TODAY, WINDOW).map((f) => f.page)).toEqual([5, 10]);
  });

  it("القاعدة الحاكمة: وجهٌ تجاوز النافذة ولم يُسمَع بعد يبقى في الربط؛ والمسموع المتجاوز ينتقل للمراجعة", () => {
    const faces: FaceStateInput[] = [
      face(11, 21, "HEARD", true), // تجاوز ٢٠ ومسموع ⟵ مستبعَد (مراجعة)
      face(12, 25, "IN_RIBAT", false), // تجاوز ٢٠ وغير مسموع ⟵ يبقى ربطاً
    ];
    expect(ribatWindow({ track: 1, reviewCycleDays: 7 }, faces, TODAY, WINDOW).map((f) => f.page)).toEqual([12]);
  });
});

describe("ribatWindow — حدّ النافذة لكل مسار", () => {
  it("المسار ٢: ١٥ مضموم، ١٦ مسموع مستبعَد", () => {
    const faces = [face(2, 15, "HEARD", true), face(3, 16, "HEARD", true)];
    expect(ribatWindow({ track: 2, reviewCycleDays: 7 }, faces, TODAY, WINDOW).map((f) => f.page)).toEqual([2]);
  });
  it("المسار ٣: ١٠ مضموم، ١١ مسموع مستبعَد", () => {
    const faces = [face(2, 10, "HEARD", true), face(3, 11, "HEARD", true)];
    expect(ribatWindow({ track: 3, reviewCycleDays: 7 }, faces, TODAY, WINDOW).map((f) => f.page)).toEqual([2]);
  });
  it("يرفض مساراً بلا نافذةٍ في الإعدادات", () => {
    expect(() => ribatWindow({ track: 9, reviewCycleDays: 7 }, [], TODAY, WINDOW)).toThrow();
  });
});
