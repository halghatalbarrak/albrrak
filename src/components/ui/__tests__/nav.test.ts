import { describe, expect, it } from "vitest";

import { menuForRoles, navSections } from "../nav";

// القائمة حسب الدور (المرحلة ١) — دالّةٌ نقيّة.

describe("menuForRoles — لا يرى أحدٌ ما لا يخصّه", () => {
  it("المدير/المشرف ⟵ إدارة (اعتمادات/حلقات/طلاب/طلبات)", () => {
    const m = menuForRoles(["CIRCLE_MANAGER"]).map((i) => i.href);
    expect(m).toEqual(["/admin/approvals", "/admin/circles", "/admin/students", "/admin/applications"]);
    expect(menuForRoles(["SUPER_ADMIN"])).toEqual(menuForRoles(["CIRCLE_MANAGER"]));
  });

  it("المعلّم ⟵ الجلسة/الحصاد/حلقتي/الحضور", () => {
    expect(menuForRoles(["TEACHER"]).map((i) => i.label)).toEqual(["الجلسة اليومية", "الحصاد", "حلقتي", "الحضور"]);
  });

  it("الطالب/الوليّ ⟵ صفحتي/السلّم/مراقي", () => {
    expect(menuForRoles(["STUDENT"]).map((i) => i.href)).toEqual(["/me", "/programs/civil-base", "/programs/maraqi"]);
    expect(menuForRoles(["GUARDIAN"])).toEqual(menuForRoles(["STUDENT"]));
  });

  it("الأعلى صلاحيّةً يُقدَّم — معلّمٌ ومديرٌ ⟵ قائمة المدير", () => {
    expect(menuForRoles(["TEACHER", "CIRCLE_MANAGER"])).toEqual(menuForRoles(["CIRCLE_MANAGER"]));
  });

  it("المُسمِّع ⟵ الحصاد فقط", () => {
    expect(menuForRoles(["RECITER"]).map((i) => i.href)).toEqual(["/admin/hasad"]);
  });
});

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
