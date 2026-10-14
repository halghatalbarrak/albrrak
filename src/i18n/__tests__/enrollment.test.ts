import { describe, expect, it } from "vitest";

import { enrollmentAr, tEnrollment } from "../ar/enrollment";

describe("قاموس شاشة إسناد الطلاب للحلقات (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tEnrollment("title")).toBe("إسناد الطلاب للحلقات");
    expect(tEnrollment("assign")).toBe("إسناد");
    expect(tEnrollment("noCircle")).toBe("بلا حلقة");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof enrollmentAr, string> = {
      title: "إسناد الطلاب للحلقات",
      crumbHome: "الرئيسة",
      crumbAdmin: "الإدارة",
      crumbEnrollment: "القيد",
      needLogin: "تحتاج دخولًا.",
      pickCircleFirst: "اختر حلقة أولًا.",
      assignDone: "تمّ الإسناد/النقل.",
      assignFailed: "تعذّر الإسناد.",
      colName: "الاسم",
      colCurrentCircle: "الحلقة الحالية",
      colAssign: "الإسناد",
      colHistory: "السجلّ",
      noCircle: "بلا حلقة",
      selectCircle: "— اختر حلقة —",
      move: "نقل",
      assign: "إسناد",
      viewBtn: "عرض",
      emptyTitle: "لا طلاب",
      emptyDescription: "لا طلاب مقبولون للإسناد بعد.",
      unassignedNote: "طالبٍ بلا حلقة — أسنِدهم أولاً.",
      pendingAssignment: "بانتظار الإسناد",
      historyTitlePrefix: "سجلّ الإسناد — ",
      loading: "…جارٍ التحميل",
      noHistory: "لا سجلّ.",
      from: "من",
      to: "إلى",
      activeParen: "(نشط)",
    };
    for (const key of Object.keys(expected) as (keyof typeof enrollmentAr)[]) {
      expect(tEnrollment(key)).toBe(expected[key]);
    }
  });
});
