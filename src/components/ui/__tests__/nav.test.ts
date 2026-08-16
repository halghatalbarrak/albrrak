import { describe, expect, it } from "vitest";

import { menuForRoles } from "../nav";

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
