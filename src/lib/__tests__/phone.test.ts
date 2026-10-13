import { describe, expect, it } from "vitest";

import { normalizeSaudiPhone, canonicalEmail, legacyEmail, emailVariants } from "../phone";

describe("توحيد صيغة الجوال السعوديّ", () => {
  it("توحّد الصيغ المختلفة لنفس الرقم إلى E.164 (9665XXXXXXXX)", () => {
    const canon = "966564099173";
    expect(normalizeSaudiPhone("0564099173")).toBe(canon); // محليّ
    expect(normalizeSaudiPhone("+966564099173")).toBe(canon); // دوليّ بـ+
    expect(normalizeSaudiPhone("966564099173")).toBe(canon); // دوليّ بلا +
    expect(normalizeSaudiPhone("00966564099173")).toBe(canon); // بادئة 00
    expect(normalizeSaudiPhone("564099173")).toBe(canon); // بلا صفرٍ ولا مفتاح
    expect(normalizeSaudiPhone("+966 56 409 9173")).toBe(canon); // بمسافات
  });

  it("البريد الموحّد واحدٌ لكلّ الصيغ، والصيغتان متاحتان للمقارنة", () => {
    expect(canonicalEmail("0564099173")).toBe("u966564099173@albrrak.app");
    expect(canonicalEmail("+966564099173")).toBe("u966564099173@albrrak.app");
    expect(legacyEmail("0564099173")).toBe("u0564099173@albrrak.app");
    expect(emailVariants("0564099173")).toEqual(["u966564099173@albrrak.app", "u0564099173@albrrak.app"]);
  });
});
