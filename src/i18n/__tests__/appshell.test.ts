import { describe, it, expect } from "vitest";
import { appshellAr } from "@/i18n/ar/appshell";

describe("appshellAr", () => {
  it("يغطّي جميع المفاتيح", () => {
    const expected: Record<keyof typeof appshellAr, string> = {
      brandLine1: "حلقات الشيخ",
      brandLine2: "محمد البراك",
      search: "بحث ",
      noResults: "لا نتائج.",
      searchHint: "اكتب حرفين فأكثر. جرّب: اسم طالب، أو «حزب ٦٠»، أو «١١٤:١».",
    };
    expect(appshellAr).toEqual(expected);
  });
});
