import { describe, expect, it } from "vitest";

import { loginAr, tLogin } from "../ar/login";

describe("قاموس صفحة الدخول (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tLogin("title")).toBe("تسجيل الدخول");
    expect(tLogin("submit")).toBe("دخول");
  });

  it("النصوص المنقولة مطابقةٌ للأصل حرفاً بحرف", () => {
    expect(tLogin("brand")).toBe("حلقات الشيخ محمد البراك");
    expect(tLogin("title")).toBe("تسجيل الدخول");
    expect(tLogin("fieldPhone")).toBe("الجوال");
    expect(tLogin("fieldPassword")).toBe("كلمة السر");
    expect(tLogin("submitting")).toBe("جارٍ الدخول…");
    expect(tLogin("submit")).toBe("دخول");
    expect(tLogin("applyLink")).toBe("ليس لديك حساب؟ تقديم طلب قيد");
    expect(tLogin("errSignIn")).toBe("تعذّر الدخول — تحقّق من الجوال وكلمة السر.");
    expect(tLogin("errConnect")).toBe("تعذّر الاتصال بخادم الدخول.");
  });

  it("كل القيم نصوصٌ غير فارغة", () => {
    for (const v of Object.values(loginAr)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
