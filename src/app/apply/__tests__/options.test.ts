import { describe, expect, it } from "vitest";
import { parseOptions } from "../options";

describe("parseOptions — مصفوفات دائمًا (لا `.map على undefined`)", () => {
  it("رد خطأ ({error}) ← مصفوفتان فارغتان", () => {
    const o = parseOptions({ error: "خطأ داخلي" });
    expect(o.nationalities).toEqual([]);
    expect(o.schoolStages).toEqual([]);
  });

  it("null / نصّ / رقم ← مصفوفتان فارغتان", () => {
    for (const bad of [null, "x", 5, undefined]) {
      const o = parseOptions(bad);
      expect(Array.isArray(o.nationalities)).toBe(true);
      expect(Array.isArray(o.schoolStages)).toBe(true);
    }
  });

  it("يُسقط العناصر المشوّهة ويُبقي الصحيحة", () => {
    const o = parseOptions({
      nationalities: [{ id: "n1", nameAr: "سعودي" }, { id: 2 }, null, "x"],
      schoolStages: "ليست مصفوفة",
    });
    expect(o.nationalities).toEqual([{ id: "n1", nameAr: "سعودي" }]);
    expect(o.schoolStages).toEqual([]);
  });
});
