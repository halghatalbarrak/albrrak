import { describe, expect, it } from "vitest";
import { accountPolicy, computeAge } from "../age-policy";

describe("computeAge (م٤: العمر محسوب لا مُدخَل)", () => {
  it("يحسب السنوات الكاملة، ولم يبلغ عيد ميلاده بعد", () => {
    expect(computeAge(new Date("2013-07-20"), new Date("2026-07-16"))).toBe(12);
  });
  it("يحسب بعد بلوغ عيد الميلاد", () => {
    expect(computeAge(new Date("2013-07-10"), new Date("2026-07-16"))).toBe(13);
  });
});

describe("accountPolicy (§٤ سياسة الأعمار)", () => {
  it("طفل ١٢ ← لا يُنشأ له حساب، والولي إلزامي", () => {
    const p = accountPolicy(12);
    expect(p.createsStudentAccount).toBe(false);
    expect(p.guardianRule).toBe("MANDATORY_NO_ACCOUNT");
  });

  it("طالب ١٥ ← حساب + ولي مرتبط بحكم الولاية + يُخبَر", () => {
    const p = accountPolicy(15);
    expect(p.createsStudentAccount).toBe(true);
    expect(p.guardianRule).toBe("GUARANTEED_BY_WILAYAH");
    expect(p.studentInformedOfGuardianVisibility).toBe(true);
  });

  it("حدّ ١٣ بالضبط ← حساب + ولاية", () => {
    expect(accountPolicy(13).createsStudentAccount).toBe(true);
    expect(accountPolicy(13).guardianRule).toBe("GUARANTEED_BY_WILAYAH");
  });

  it("١٧ ← ولاية مضمونة؛ ١٨ ← بإذنه", () => {
    expect(accountPolicy(17).guardianRule).toBe("GUARANTEED_BY_WILAYAH");
    expect(accountPolicy(18).guardianRule).toBe("BY_STUDENT_CONSENT");
  });
});
