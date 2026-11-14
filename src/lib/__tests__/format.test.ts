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

describe("DailyRecorder — لا أرقام غربية في مخرجات العرض", () => {
  it("formatAyah لا تُخرج أرقامًا غربية (0–9)", () => {
    const cases = [
      formatAyah(100, 1),
      formatAyah(100, 1, 100, 10),
      formatAyah(100, 1, 101, 5),
      formatAyah(1, 7),
      formatAyah(114, 6),
    ];
    for (const result of cases) {
      expect(result, `يحتوي على رقم غربي: "${result}"`).not.toMatch(/[0-9]/);
    }
  });

  it("arNum تحوّل جميع الأرقام الغربية إلى هنديّة", () => {
    expect(arNum(0)).toBe("٠");
    expect(arNum(1234567890)).toBe("١٢٣٤٥٦٧٨٩٠");
    expect(String(arNum(100))).not.toMatch(/[0-9]/);
  });
});
