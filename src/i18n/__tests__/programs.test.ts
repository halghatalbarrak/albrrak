import { describe, expect, it } from "vitest";

import { programsAr, tPrograms } from "../ar/programs";

describe("قاموس شاشة إعدادات البرنامج (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tPrograms("saveBtn")).toBe("حفظ الإعدادات");
    expect(tPrograms("okSaved")).toBe("حُفظت الإعدادات.");
    expect(tPrograms("titlePrefix")).toBe("إعدادات: ");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof programsAr, string> = {
      crumbHome: "الرئيسة",
      crumbAdmin: "الإدارة",
      crumbProgramSettings: "إعدادات البرنامج",
      errForbidden: "لا صلاحية — إعدادات البرامج للمشرف/المدير.",
      errLoadSettings: "تعذّر جلب الإعدادات.",
      errSave: "تعذّر الحفظ.",
      okSaved: "حُفظت الإعدادات.",
      titlePrefix: "إعدادات: ",
      loading: "جارٍ التحميل…",
      intro: "عند تخرّج طالبٍ من هذا البرنامج ينتقل تلقائيًّا (اليوم التالي) إلى البرنامج التالي بالمسار الافتراضيّ. بلا إعدادٍ ⟵ لا انتقال، وتنبيهٌ للمشرف.",
      fieldNextProgram: "البرنامج التالي (عند التخرّج)",
      optionNoTransition: "— لا انتقال —",
      fieldDefaultTrack: "المسار الافتراضيّ للمنتقلين (يبدؤون من الفاتحة به)",
      saveNextFirst: "احفظ البرنامج التالي أولًا، ثمّ اختر مساره.",
      optionNoTrack: "— بلا مسار —",
      saveBtn: "حفظ الإعدادات",
    };
    for (const key of Object.keys(expected) as (keyof typeof programsAr)[]) {
      expect(tPrograms(key)).toBe(expected[key]);
    }
  });
});
