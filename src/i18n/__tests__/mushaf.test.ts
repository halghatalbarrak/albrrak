import { describe, expect, it } from "vitest";

import { mushafAr, tMushaf } from "../ar/mushaf";

describe("قاموس شاشة المصحف (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tMushaf("prevFace")).toBe("الوجه السابق");
    expect(tMushaf("nextFace")).toBe("الوجه التالي");
  });

  it("لا مفتاحٍ بقيمةٍ فارغة", () => {
    for (const [key, value] of Object.entries(mushafAr)) {
      expect(value, key).not.toBe("");
    }
  });
});
