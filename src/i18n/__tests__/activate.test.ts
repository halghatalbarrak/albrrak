import { describe, expect, it } from "vitest";

import { activateAr, tActivate } from "../ar/activate";

describe("قاموس صفحة التفعيل (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tActivate("titleActivate")).toBe("تفعيل الحساب");
    expect(tActivate("goLogin")).toBe("الذهاب للدخول");
  });

  it("النصوص المنقولة مطابقةٌ للأصل حرفاً بحرف", () => {
    expect(tActivate("titleReset")).toBe("إعادة تعيين كلمة السرّ");
    expect(tActivate("titleActivate")).toBe("تفعيل الحساب");
    expect(tActivate("checking")).toBe("جارٍ التحقّق…");
    expect(tActivate("noToken")).toBe("لا رمز في الرابط.");
    expect(tActivate("invalidLink")).toBe("رابطٌ غير صالح.");
    expect(tActivate("doneMsg")).toBe("تمّ ضبط كلمة السرّ. يمكنك الدخول الآن.");
    expect(tActivate("goLogin")).toBe("الذهاب للدخول");
    expect(tActivate("readyHint")).toBe("اختر كلمة سرٍّ جديدة (ثمانية أحرفٍ فأكثر).");
    expect(tActivate("fieldPassword")).toBe("كلمة السرّ");
    expect(tActivate("fieldPasswordConfirm")).toBe("تأكيد كلمة السرّ");
    expect(tActivate("saveAndLogin")).toBe("حفظ والدخول");
    expect(tActivate("errPasswordShort")).toBe("كلمة السرّ ثمانية أحرفٍ فأكثر.");
    expect(tActivate("errPasswordMismatch")).toBe("كلمتا السرّ غير متطابقتين.");
    expect(tActivate("errSave")).toBe("تعذّر ضبط كلمة السرّ.");
  });

  it("كل القيم نصوصٌ غير فارغة", () => {
    for (const v of Object.values(activateAr)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
