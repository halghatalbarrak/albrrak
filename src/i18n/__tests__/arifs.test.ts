import { describe, expect, it } from "vitest";

import { arifsAr, tArifs } from "../ar/arifs";

describe("قاموس شاشة العرفاء (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tArifs("title")).toBe("العرفاء");
    expect(tArifs("appointBtn")).toBe("عيّن عريفًا");
    expect(tArifs("dismissBtn")).toBe("عزل");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof arifsAr, string> = {
      title: "العرفاء",
      crumbHome: "الرئيسة",
      crumbOps: "التشغيل",
      crumbArifs: "العرفاء",
      intro: "العريف يُسمِّع الترسيخ والمراجعة بإسنادك ومسؤوليتك — لا الحفظ الجديد ولا الاختبار.",
      appointed: "عُيّن عريفًا.",
      dismissed: "عُزل.",
      actionFailed: "تعذّر.",
      needLogin: "تحتاج دخولًا.",
      login: "دخول",
      selectCircle: "— اختر حلقة —",
      loading: "…جارٍ التحميل",
      loadFailed: "تعذّر التحميل.",
      retry: "إعادة",
      idleTitle: "اختر حلقةً لإدارة عرفائها",
      activeArifsTitle: "العرفاء النشطون",
      noArifs: "لا عرفاء بعد.",
      dismissBtn: "عزل",
      candidatesTitle: "طلاب الحلقة (للتعيين — أنت تقدّر تقدّمهم)",
      noCandidates: "لا طلاب متاحين.",
      appointBtn: "عيّن عريفًا",
    };
    for (const key of Object.keys(expected) as (keyof typeof arifsAr)[]) {
      expect(tArifs(key)).toBe(expected[key]);
    }
  });
});
