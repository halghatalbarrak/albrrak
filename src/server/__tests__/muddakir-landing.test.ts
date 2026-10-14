import { describe, expect, it } from "vitest";

import { muddakirLanding } from "@/lib/muddakir-landing";

// توجيه الدخول (و١): مَن له دورٌ عامّ ⟵ اللوحة الرئيسة؛ ومَن لا دورَ عامّ له لكنه طاقم مدّكر ⟵ واجهة
// المدّكر التي تقبلها صلاحيّته — لا صفحةٌ فارغة ولا «لا صلاحية».

describe("وجهة دخول صاحب وظيفة المدّكر", () => {
  it("مدير برنامج المدّكر بلا دورٍ عامّ ⟵ لوحة المشرف", () => {
    expect(muddakirLanding([], ["MANAGER"])).toBe("/muddakir/supervisor");
  });

  it("المشرف بلا دورٍ عامّ ⟵ لوحة المشرف", () => {
    expect(muddakirLanding([], ["SUPERVISOR"])).toBe("/muddakir/supervisor");
  });

  it("المختبِر بلا دورٍ عامّ ⟵ لوحة التسميع", () => {
    expect(muddakirLanding([], ["EXAMINER"])).toBe("/muddakir/recitation");
  });

  it("مَن له دورٌ عامّ ⟵ اللوحة الرئيسة (لا توجيه)", () => {
    expect(muddakirLanding(["TEACHER"], ["MANAGER"])).toBeNull();
    expect(muddakirLanding(["SUPER_ADMIN"], [])).toBeNull();
  });

  it("لا دورَ ولا وظيفة ⟵ لا توجيه خاصّ", () => {
    expect(muddakirLanding([], [])).toBeNull();
  });
});
