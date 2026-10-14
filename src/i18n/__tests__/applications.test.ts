import { describe, expect, it } from "vitest";

import { applicationsAr, tApplications } from "../ar/applications";

describe("قاموس طلبات القيد (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tApplications("shellTitlePrefix")).toBe("طلبات القيد");
    expect(tApplications("btnAccept")).toBe("قبول");
    expect(tApplications("btnReject")).toBe("رفض");
  });

  it("كلّ مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    expect(tApplications("errNoPermission")).toBe("لا صلاحية — هذه الشاشة للمدير.");
    expect(tApplications("errLoad")).toBe("تعذّر جلب الطلبات.");
    expect(tApplications("errDecide")).toBe("تعذّر تنفيذ القرار.");
    expect(tApplications("errReveal")).toBe("تعذّر كشف رقم الهوية.");
    expect(tApplications("rejectPrompt")).toBe("سبب الرفض (إلزامي):");
    expect(tApplications("colName")).toBe("الاسم");
    expect(tApplications("colStatus")).toBe("الحالة");
    expect(tApplications("colInfo")).toBe("البيانات");
    expect(tApplications("colGuardian")).toBe("ولي الأمر");
    expect(tApplications("colHifz")).toBe("الحفظ");
    expect(tApplications("colActions")).toBe("إجراءات");
    expect(tApplications("statusWaitlisted")).toBe("قائمة الانتظار");
    expect(tApplications("statusNew")).toBe("جديد");
    expect(tApplications("genderMale")).toBe("ذكر");
    expect(tApplications("genderFemale")).toBe("أنثى");
    expect(tApplications("infoYearsUnit")).toBe("سنة");
    expect(tApplications("hifzJuzUnit")).toBe("جزء");
    expect(tApplications("btnAccept")).toBe("قبول");
    expect(tApplications("btnReject")).toBe("رفض");
    expect(tApplications("btnWaitlist")).toBe("انتظار");
    expect(tApplications("btnRevealId")).toBe("كشف الهوية");
    expect(tApplications("revealedIdPrefix")).toBe("الهوية: ");
    expect(tApplications("shellTitlePrefix")).toBe("طلبات القيد");
    expect(tApplications("crumbHome")).toBe("الرئيسة");
    expect(tApplications("crumbAdmin")).toBe("الإدارة");
    expect(tApplications("crumbApplications")).toBe("الطلبات");
    expect(tApplications("emptyTitle")).toBe("لا طلبات معلّقة");
    expect(tApplications("emptyDescription")).toBe("ستظهر هنا طلبات القيد الجديدة عند ورودها.");
    expect(tApplications("oldestPendingPrefix")).toBe("أقدم طلبٍ معلّق منذ ");
    expect(tApplications("oldestPendingSuffix")).toBe(" يومًا — ابدأ به.");
    expect(tApplications("pendingReviewSuffix")).toBe(" بانتظار المراجعة");
  });

  it("لا مفتاحٍ بقيمةٍ فارغة", () => {
    for (const [key, value] of Object.entries(applicationsAr)) {
      expect(value, key).not.toBe("");
    }
  });
});
