import { describe, expect, it } from "vitest";

import { grantPointsAr, tGrantPoints } from "../ar/grant-points";

describe("قاموس شاشة منح النقاط (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tGrantPoints("title")).toBe("منح نقاط");
    expect(tGrantPoints("grantBtn")).toBe("منح");
    expect(tGrantPoints("okGranted")).toBe("تمّ المنح.");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof grantPointsAr, string> = {
      crumbHome: "الرئيسة",
      crumbOperation: "التشغيل",
      crumbGrantPoints: "منح نقاط",
      errForbidden: "لا صلاحية — للمعلّم والإدارة.",
      errLoadData: "تعذّر جلب البيانات.",
      errSelectStudentAndItem: "اختر الطالب والبند.",
      errGrant: "تعذّر المنح.",
      okGranted: "تمّ المنح.",
      title: "منح نقاط",
      intro: "تمنح لطلاب حلقتك فقط، ومن البنود المسموحة لك. الخادم يرفض ما عدا ذلك.",
      fieldStudent: "الطالب",
      studentPlaceholder: "اختر طالبًا…",
      fieldItem: "البند",
      itemPlaceholder: "اختر بندًا…",
      fieldNote: "ملاحظة (اختياريّة)",
      notePlaceholder: "سبب المنح…",
      grantBtn: "منح",
      colItem: "البند",
      colPoints: "النقاط",
      colBy: "منحها",
      colNote: "ملاحظة",
      bySystem: "النظام",
      statCurrentBalance: "الرصيد الحاليّ",
      recentTransactions: "آخر الحركات",
      emptyTransactions: "لا حركات بعد.",
    };
    for (const key of Object.keys(expected) as (keyof typeof grantPointsAr)[]) {
      expect(tGrantPoints(key)).toBe(expected[key]);
    }
  });
});
