import { describe, expect, it } from "vitest";

import { navSections } from "../nav";

// أقسام الشريط الجانبيّ — **اتّحاد** أقسام كلّ الأدوار، لا «أعلى دورٍ يفوز». دوالُّ نقيّة.

const labels = (roles: string[]) => navSections(roles).map((s) => s.label);
const keys = (roles: string[]) => navSections(roles).map((s) => s.key);

describe("navSections — اتّحاد أقسام كلّ أدوار المستخدم", () => {
  it("مشرفٌ عامٌّ ووليٌّ (حالة محمد) ⟵ يرى الإدارة والرسائل (وكلّ أقسام العمل)", () => {
    const s = navSections(["SUPER_ADMIN", "CIRCLE_MANAGER", "REGISTRAR", "GUARDIAN"]);
    const k = s.map((x) => x.key);
    expect(k).toContain("manage");
    expect(k).toContain("messages");
    // المشرف يرى ما يراه المعلّم (عرضاً) — التشغيل والحصاد.
    expect(k).toContain("operate");
    expect(k).toContain("harvest");
    // الترتيب الثابت محفوظ.
    expect(k).toEqual(["manage", "operate", "harvest", "messages"]);
  });

  it("المشرف/المدير ⟵ يرى كلّ أقسام العمل الثلاثة (قرار محمد: العرض لا الصلاحية)", () => {
    expect(keys(["SUPER_ADMIN"])).toEqual(["manage", "operate", "harvest"]);
    expect(navSections(["SUPER_ADMIN"])).toEqual(navSections(["CIRCLE_MANAGER"]));
  });

  it("وليٌّ صرفٌ ⟵ الرسائل فقط، ولا يسقط إلى قسم الطالب", () => {
    const s = navSections(["GUARDIAN"]);
    expect(s.map((x) => x.key)).toEqual(["messages"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/messages"]);
    // لا قسم تعلّمٍ ولا صفحاتِ طالب (صفحتي/مراقي).
    const allHrefs = s.flatMap((x) => x.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/me");
    expect(allHrefs).not.toContain("/programs/maraqi");
  });

  it("المعلّم ⟵ التشغيل والحصاد", () => {
    expect(labels(["TEACHER"])).toEqual(["التشغيل", "الحصاد"]);
  });

  it("المُسمِّع ⟵ الحصاد فقط", () => {
    const s = navSections(["RECITER"]);
    expect(s.map((x) => x.key)).toEqual(["harvest"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/admin/hasad"]);
  });

  it("الطالب ⟵ التعلّم والرسائل (والرسائل خرجت من قسم الطالب)", () => {
    const s = navSections(["STUDENT"]);
    expect(s.map((x) => x.key)).toEqual(["learn", "messages"]);
    // قسم التعلّم بلا «الرسائل» (انتقلت لموضعها المشترك).
    expect(navSections(["STUDENT"])[0].items.map((i) => i.href)).toEqual(["/me", "/programs/civil-base", "/programs/maraqi"]);
    // «الرسائل» يراها الطالب والوليّ كلاهما.
    expect(keys(["STUDENT"])).toContain("messages");
    expect(keys(["GUARDIAN"])).toContain("messages");
  });

  it("طالبٌ وليّ (وليّ ابنه وطالبٌ نفسه) ⟵ التعلّم والرسائل بلا تكرار", () => {
    expect(keys(["STUDENT", "GUARDIAN"])).toEqual(["learn", "messages"]);
  });

  it("معلّمٌ ومديرٌ ⟵ لا يُسقط دورٌ دوراً: يرى الإدارة والتشغيل والحصاد", () => {
    // الاتّحاد لا الإقصاء — عكس السلوك القديم «الأعلى يفوز».
    expect(keys(["TEACHER", "CIRCLE_MANAGER"])).toEqual(["manage", "operate", "harvest"]);
  });

  // إصلاح الوميض: دورٌ غير معروف (فارغ) ⟵ لا قائمةَ افتراضية إطلاقاً.
  it("بلا أدوار ⟵ [] (لا قائمةَ طالبٍ افتراضية)", () => {
    expect(navSections([])).toEqual([]);
  });
});
