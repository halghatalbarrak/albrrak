import { describe, expect, it } from "vitest";

import { approvalsAr, tApprovals } from "../ar/approvals";

describe("قاموس لوحة اعتماد المدير (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tApprovals("title")).toBe("الاعتمادات");
    expect(tApprovals("approveBtn")).toBe("اعتماد");
    expect(tApprovals("rankExcellent")).toBe("تميّز");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof approvalsAr, string> = {
      title: "الاعتمادات",
      crumbHome: "الرئيسة",
      crumbAdmin: "الإدارة",
      crumbApprovals: "الاعتمادات",
      rankExcellent: "تميّز",
      rankPass: "اجتياز",
      rankFail: "رسوب",
      rejectNeedsReason: "الرفض يستلزم سببًا.",
      decideFailed: "تعذّر حسم الاقتراح.",
      rejectReasonPlaceholder: "سبب الرفض (عند الرفض)",
      approveBtn: "اعتماد",
      rejectBtn: "رفض",
      colStudent: "الطالب",
      colStage: "المرحلة",
      colRank: "المرتبة",
      colRejectReason: "سبب الرفض",
      colActions: "إجراءات",
      colStatus: "الحالة",
      threeRoundsDone: "اكتملت ثلاث جولات",
      needManagerLogin: "تحتاج دخولًا كمدير.",
      login: "دخول",
      loading: "…جارٍ التحميل",
      loadFailed: "تعذّر التحميل.",
      retry: "إعادة",
      emptyTitle: "لا اعتمادات معلّقة",
      emptyDescription: "لا اقتراحات انتقالٍ أو تخرّجٍ بانتظارك الآن.",
      stageSectionTitle: "انتقال المرحلة",
      stageSectionNote: "اعتمادُك ينقل الطالب للمرحلة الأصلية التالية.",
      noPendingTransitions: "لا اقتراحات انتقالٍ معلَّقة.",
      graduationSectionTitle: "التخرّج",
      graduationSectionNote: "اعتمادُك يخرّج الطالب ويُصدر شهادة الختم.",
      noPendingGraduations: "لا اقتراحات تخرّجٍ معلَّقة.",
    };
    for (const key of Object.keys(expected) as (keyof typeof approvalsAr)[]) {
      expect(tApprovals(key)).toBe(expected[key]);
    }
  });
});
