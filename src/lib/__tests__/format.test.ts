import { describe, expect, it } from "vitest";

import { arNum, formatAyah } from "../format";

describe("formatAyah", () => {
  it("آيةٌ واحدة في سورة", () => {
    expect(formatAyah(1, 1)).toBe("الفاتحة ١");
  });

  it("مدًى داخل السورة الواحدة (سطرٌ متوسّط)", () => {
    expect(formatAyah(1, 1, 1, 6)).toBe("الفاتحة ١ – ٦");
  });

  it("مدًى عابرٌ لسورتين", () => {
    expect(formatAyah(112, 1, 114, 6)).toBe("الإخلاص ١ – الناس ٦");
  });

  it("الحدّ الأدنى (السورة ١)", () => {
    expect(formatAyah(1, 7)).toBe("الفاتحة ٧");
  });

  it("الحدّ الأقصى (السورة ١١٤، آخر آية)", () => {
    expect(formatAyah(114, 6)).toBe("الناس ٦");
  });

  it("مدًى منطبقٌ على آيةٍ واحدة يُعرض مفردًا", () => {
    expect(formatAyah(2, 5, 2, 5)).toBe("البقرة ٥");
  });

  it("أرقامٌ هنديّة", () => {
    expect(arNum(2026)).toBe("٢٠٢٦");
  });
});
