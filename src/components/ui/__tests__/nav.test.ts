import { describe, expect, it } from "vitest";

import { navSections } from "../nav";

// أقسام الشريط الجانبيّ حسب الدور — دوالُّ نقيّة.

describe("navSections — أقسام الشريط الجانبيّ محكومةٌ بالدور", () => {
  it("المدير ⟵ قسم الإدارة وحده، يضمّ كلّ صفحاته", () => {
    const s = navSections(["CIRCLE_MANAGER"]);
    expect(s.map((x) => x.label)).toEqual(["الإدارة"]);
    expect(s[0].items.map((i) => i.href)).toContain("/admin/lists");
    expect(navSections(["SUPER_ADMIN"])).toEqual(navSections(["CIRCLE_MANAGER"]));
  });

  it("المعلّم ⟵ قسما التشغيل والحصاد", () => {
    expect(navSections(["TEACHER"]).map((x) => x.label)).toEqual(["التشغيل", "الحصاد"]);
  });

  it("المُسمِّع ⟵ الحصاد فقط", () => {
    const s = navSections(["RECITER"]);
    expect(s.map((x) => x.label)).toEqual(["الحصاد"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/admin/hasad"]);
  });

  it("الطالب/الوليّ ⟵ قسم التعلّم", () => {
    expect(navSections([]).map((x) => x.label)).toEqual(["التعلّم"]);
    expect(navSections(["STUDENT"])[0].items.map((i) => i.href)).toEqual(["/me", "/programs/civil-base", "/programs/maraqi"]);
  });

  it("الأعلى صلاحيّةً يُقدَّم — معلّمٌ ومديرٌ ⟵ أقسام المدير", () => {
    expect(navSections(["TEACHER", "CIRCLE_MANAGER"])).toEqual(navSections(["CIRCLE_MANAGER"]));
  });
});
