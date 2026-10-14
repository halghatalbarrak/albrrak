import { describe, expect, it } from "vitest";

import { hasadAr, tHasad, type HasadKey } from "../ar/hasad";

describe("قاموس الحصاد (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tHasad("pageTitle")).toBe("الحصاد");
    expect(tHasad("rankExcellent")).toBe("تميّز");
    expect(tHasad("etypeForgottenAyah")).toBe("نسيان آية");
  });

  it("كلّ مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    for (const key of Object.keys(hasadAr) as HasadKey[]) {
      expect(tHasad(key)).toBe(hasadAr[key]);
    }
  });
});
