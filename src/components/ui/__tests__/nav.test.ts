import { describe, expect, it } from "vitest";

import { navSections } from "../nav";

// أقسام الشريط الجانبيّ — **اتّحاد** أقسام كلّ الأدوار، لا «أعلى دورٍ يفوز». دوالُّ نقيّة.

const labels = (roles: string[]) => navSections(roles).map((s) => s.label);
const keys = (roles: string[]) => navSections(roles).map((s) => s.key);

describe("navSections — اتّحاد أقسام كلّ أدوار المستخدم", () => {
  it("مشرفٌ عامٌّ ووليٌّ (حالة محمد) ⟵ يرى الإدارة والبرامج والرسائل (وكلّ أقسام العمل)", () => {
    const s = navSections(["SUPER_ADMIN", "CIRCLE_MANAGER", "REGISTRAR", "GUARDIAN"]);
    const k = s.map((x) => x.key);
    expect(k).toContain("manage");
    expect(k).toContain("messages");
    // المشرف يرى ما يراه المعلّم (عرضاً) — التشغيل والحصاد.
    expect(k).toContain("operate");
    expect(k).toContain("harvest");
    // ويرى البرامج (المنهج المشترك)، والرسائل (لأنّه وليٌّ أيضاً).
    expect(k).toContain("programs");
    // الترتيب الثابت محفوظ: الإدارة · التشغيل · الحصاد · البرامج · … · الرسائل.
    expect(k).toEqual(["manage", "operate", "harvest", "programs", "messages"]);
  });

  it("المشرف/المدير ⟵ يرى كلّ أقسام العمل الثلاثة والبرامج (قرار محمد: العرض لا الصلاحية)", () => {
    expect(keys(["SUPER_ADMIN"])).toEqual(["manage", "operate", "harvest", "programs"]);
    expect(navSections(["SUPER_ADMIN"])).toEqual(navSections(["CIRCLE_MANAGER"]));
  });

  it("وليٌّ صرفٌ ⟵ الرسائل فقط، ولا يسقط إلى قسم الطالب ولا يرى البرامج", () => {
    const s = navSections(["GUARDIAN"]);
    expect(s.map((x) => x.key)).toEqual(["messages"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/messages"]);
    // لا قسم تعلّمٍ ولا برامجَ ولا صفحاتِ طالب (صفحتي/مراقي).
    const allHrefs = s.flatMap((x) => x.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/me");
    expect(allHrefs).not.toContain("/programs/maraqi");
    expect(keys(["GUARDIAN"])).not.toContain("programs");
  });

  it("المعلّم ⟵ التشغيل والحصاد والبرامج", () => {
    expect(labels(["TEACHER"])).toEqual(["التشغيل", "الحصاد", "البرامج"]);
  });

  it("المُسمِّع ⟵ الحصاد والبرامج", () => {
    const s = navSections(["RECITER"]);
    expect(s.map((x) => x.key)).toEqual(["harvest", "programs"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/admin/hasad"]);
  });

  it("الطالب ⟵ البرامج والتعلّم والرسائل", () => {
    const s = navSections(["STUDENT"]);
    expect(s.map((x) => x.key)).toEqual(["programs", "learn", "messages"]);
    // قسم التعلّم أصبح «صفحتي» وحدها (خرجت البرامج لقسمها المستقلّ).
    const learn = s.find((x) => x.key === "learn")!;
    expect(learn.items.map((i) => i.href)).toEqual(["/me"]);
    // «الرسائل» يراها الطالب والوليّ كلاهما.
    expect(keys(["STUDENT"])).toContain("messages");
    expect(keys(["GUARDIAN"])).toContain("messages");
  });

  it("طالبٌ وليّ (وليّ ابنه وطالبٌ نفسه) ⟵ البرامج والتعلّم والرسائل بلا تكرار", () => {
    expect(keys(["STUDENT", "GUARDIAN"])).toEqual(["programs", "learn", "messages"]);
  });

  it("معلّمٌ ومديرٌ ⟵ لا يُسقط دورٌ دوراً: يرى الإدارة والتشغيل والحصاد والبرامج", () => {
    // الاتّحاد لا الإقصاء — عكس السلوك القديم «الأعلى يفوز».
    expect(keys(["TEACHER", "CIRCLE_MANAGER"])).toEqual(["manage", "operate", "harvest", "programs"]);
  });

  // إصلاح الوميض: دورٌ غير معروف (فارغ) ⟵ لا قائمةَ افتراضية إطلاقاً.
  it("بلا أدوار ⟵ [] (لا قائمةَ طالبٍ افتراضية)", () => {
    expect(navSections([])).toEqual([]);
  });
});

// ── قسم «البرامج» المستقلّ (المنهج لا بيانات شخص) ──
describe("navSections — «البرامج» قسمٌ مستقلٌّ يراه الجميع", () => {
  const programsOf = (roles: string[]) => navSections(roles).find((s) => s.key === "programs");

  it("مشرفٌ يرى البرامج ولا يرى «صفحتي»", () => {
    const s = navSections(["SUPER_ADMIN"]);
    expect(s.map((x) => x.key)).toContain("programs");
    const allHrefs = s.flatMap((x) => x.items.map((i) => i.href));
    expect(allHrefs).toContain("/programs/civil-base");
    expect(allHrefs).toContain("/programs/maraqi");
    // «صفحتي» شاشة الطالب عن نفسه — لا معنى لها للمشرف.
    expect(allHrefs).not.toContain("/me");
    expect(s.map((x) => x.key)).not.toContain("learn");
  });

  it("طالبٌ يرى الاثنين: البرامج و«صفحتي» في التعلّم", () => {
    const s = navSections(["STUDENT"]);
    expect(s.map((x) => x.key)).toContain("programs");
    const allHrefs = s.flatMap((x) => x.items.map((i) => i.href));
    expect(allHrefs).toContain("/programs/civil-base");
    expect(allHrefs).toContain("/programs/maraqi");
    expect(allHrefs).toContain("/me");
  });

  it("يراه كلّ الأدوار الخمسة: المشرف والمدير والمعلّم والمُسمِّع والطالب", () => {
    for (const role of ["SUPER_ADMIN", "CIRCLE_MANAGER", "TEACHER", "RECITER", "STUDENT"]) {
      expect(programsOf([role]), role).toBeDefined();
    }
  });

  it("مداخله ثابتة الترتيب: القاعدة المدنية أوّلاً ثمّ مراقي", () => {
    const p = programsOf(["STUDENT"])!;
    expect(p.label).toBe("البرامج");
    expect(p.items).toEqual([
      { label: "القاعدة المدنية", href: "/programs/civil-base" },
      { label: "مراقي", href: "/programs/maraqi" },
    ]);
  });
});
