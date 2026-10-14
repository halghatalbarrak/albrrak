import { describe, expect, it } from "vitest";

import { muddakirAr, stageLabel, tMuddakir } from "../ar/muddakir";

describe("قاموس المُدَّكِر (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tMuddakir("programName")).toBe("المُدَّكِر");
    expect(tMuddakir("roleHafiz")).toBe("الحافظ");
    expect(tMuddakir("pillarRibat")).toBe("الربط");
  });

  it("المصطلحات الملزَمة حاضرة (§٢): الحافظ/المشرف/المختبِر/المدير", () => {
    expect([
      tMuddakir("roleHafiz"),
      tMuddakir("roleSupervisor"),
      tMuddakir("roleExaminer"),
      tMuddakir("roleManager"),
    ]).toEqual(["الحافظ", "المشرف", "المختبِر", "المدير"]);
  });

  it("لا تظهر «طالب» ولا «عريف» في أي نصٍّ للمستخدم (§٠٫٥)", () => {
    const all = Object.values(muddakirAr).join(" | ");
    expect(all).not.toMatch(/طالب/);
    expect(all).not.toMatch(/عريف/);
  });

  it("stageLabel يستعمل القاموس والأرقام الهنديّة", () => {
    expect(stageLabel(1)).toBe("المرحلة ١");
    expect(stageLabel(6)).toBe("المرحلة ٦");
  });

  it("مفاتيح النقل المشتركة (PR-1c) تُرجع نصّها الأصليّ حرفاً بحرف", () => {
    expect(tMuddakir("login")).toBe("دخول");
    expect(tMuddakir("loading")).toBe("…جارٍ التحميل");
    expect(tMuddakir("loadFailed")).toBe("تعذّر التحميل.");
    expect(tMuddakir("retry")).toBe("إعادة");
    expect(tMuddakir("genericError")).toBe("تعذّر.");
    expect(tMuddakir("needLogin")).toBe("تحتاج دخولًا.");
    expect(tMuddakir("crumbHome")).toBe("الرئيسة");
    expect(tMuddakir("crumbAdmin")).toBe("الإدارة");
    expect(tMuddakir("hafizOnlyNote")).toBe("هذه الشاشة للحافظ الملتحق بالمُدَّكِر.");
    expect(tMuddakir("repAria")).toBe("تكرار");
  });
});
