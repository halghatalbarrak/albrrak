import { describe, expect, it } from "vitest";

import { navSections } from "../nav";
import { navAr as L } from "@/i18n/ar/nav";

// أقسام الشريط الجانبيّ — تصنيفٌ وظيفيٌّ بترتيبٍ ثابت، مع الحفاظ التامّ على رؤية كلّ دور.
// (دوالُّ نقيّة؛ التبويبات تجمع صفحاتٍ متقاربةً فوق مساراتها بلا تغيير صلاحية.)

const keys = (roles: string[]) => navSections(roles).map((s) => s.key);
const hrefsOf = (roles: string[], key: string) =>
  (navSections(roles).find((s) => s.key === key)?.items ?? []).map((i) => i.href);

describe("navSections — الترتيب والتصنيف الوظيفيّ", () => {
  it("المشرف العام ⟵ الترتيب الكامل الثابت", () => {
    expect(keys(["SUPER_ADMIN"])).toEqual([
      "home", "operate", "circles", "students", "assess", "motivate", "programs", "muddakir", "settings",
    ]);
  });

  it("مدير الحلقات ⟵ كالمشرف لكنْ بلا «المستخدمون» في الإعدادات", () => {
    expect(keys(["CIRCLE_MANAGER"])).toEqual([
      "home", "operate", "circles", "students", "assess", "motivate", "programs", "muddakir", "settings",
    ]);
    expect(hrefsOf(["SUPER_ADMIN"], "settings")).toContain("/admin/users");
    expect(hrefsOf(["CIRCLE_MANAGER"], "settings")).not.toContain("/admin/users");
    expect(hrefsOf(["CIRCLE_MANAGER"], "settings")).toContain("/admin/lists");
  });

  it("المدير التقنيّ ⟵ الرئيسية والإعدادات (المستخدمون) فقط", () => {
    expect(keys(["TECH_ADMIN"])).toEqual(["home", "settings"]);
    expect(hrefsOf(["TECH_ADMIN"], "settings")).toEqual(["/admin/users"]);
  });

  it("مجموعة «الطلاب والقيد»: الطلاب والطلبات؛ والاستيراد للمشرف العام وحده", () => {
    expect(hrefsOf(["SUPER_ADMIN"], "students")).toEqual(["/admin/students", "/admin/applications", "/admin/students/import"]);
    expect(hrefsOf(["CIRCLE_MANAGER"], "students")).toEqual(["/admin/students", "/admin/applications"]);
  });

  it("مجموعة «الحلقات والحضور»: الحلقات والحضور والعرفاء", () => {
    expect(hrefsOf(["SUPER_ADMIN"], "circles")).toEqual(["/admin/circles", "/admin/attendance", "/admin/arifs"]);
  });

  it("مجموعة «التحفيز» تضمّ البيدر (إدارة الثمار)", () => {
    expect(hrefsOf(["CIRCLE_MANAGER"], "motivate")).toContain("/admin/market");
  });

  it("مجموعة «المُدَّكِر» (للمشرف) تضمّ البرنامج والطلبات والطاقم واللقاء والسرد", () => {
    const h = hrefsOf(["CIRCLE_MANAGER"], "muddakir");
    expect(h).toEqual(["/admin/muddakir", "/admin/muddakir/requests", "/admin/muddakir/staff", "/admin/muddakir/tathbit", "/muddakir/supervisor", "/muddakir/recitation"]);
  });

  it("المعلّم ⟵ الرئيسية والتشغيل والحلقات والحضور والتقييم والمناهج (بلا طلاب/تحفيز/مُدَّكِر/إعدادات)", () => {
    expect(keys(["TEACHER"])).toEqual(["home", "operate", "circles", "assess", "programs"]);
    // للمعلّم «حلقتي» لا «الحلقات».
    expect(navSections(["TEACHER"]).find((s) => s.key === "circles")!.items[0].label).toBe(L.circlesMine);
  });

  it("المُسمِّع ⟵ الرئيسية والتقييم والمناهج وسرد المُدَّكِر", () => {
    expect(keys(["RECITER"])).toEqual(["home", "assess", "programs", "muddakirExam"]);
    expect(hrefsOf(["RECITER"], "muddakirExam")).toEqual(["/muddakir/recitation"]);
  });

  it("الطالب ⟵ المناهج والتعلّم والرسائل (بلا رئيسية)", () => {
    expect(keys(["STUDENT"])).toEqual(["programs", "learn", "messages"]);
    expect(hrefsOf(["STUDENT"], "learn")).toEqual(["/me", "/me/journey"]);
  });

  it("وليٌّ صرفٌ ⟵ الرسائل وحدها، لا يسقط إلى الطالب ولا يرى المناهج", () => {
    expect(keys(["GUARDIAN"])).toEqual(["messages"]);
    const all = navSections(["GUARDIAN"]).flatMap((s) => s.items.map((i) => i.href));
    expect(all).not.toContain("/me");
    expect(all).not.toContain("/programs/maraqi");
  });

  it("طالبٌ وليٌّ ⟵ المناهج والتعلّم والرسائل بلا تكرار", () => {
    expect(keys(["STUDENT", "GUARDIAN"])).toEqual(["programs", "learn", "messages"]);
  });

  it("معلّمٌ ومديرٌ ⟵ اتّحادٌ لا إقصاء (الترتيب الكامل)", () => {
    expect(keys(["TEACHER", "CIRCLE_MANAGER"])).toEqual([
      "home", "operate", "circles", "students", "assess", "motivate", "programs", "muddakir", "settings",
    ]);
  });

  it("بلا أدوار ⟵ [] (لا وميض)", () => {
    expect(navSections([])).toEqual([]);
  });

  it("أمينُ بيدرٍ صرفٌ (م٦ب) ⟵ «البيدر» وحده بمدخل «الجَنْي»", () => {
    expect(keys(["SELLER"])).toEqual(["market"]);
    expect(hrefsOf(["SELLER"], "market")).toEqual(["/sell"]);
  });

  it("المشرف (ARIF) ⟵ «المُدَّكِر» وحده (حفّاظي واللقاء الأسبوعيّ)", () => {
    const s = navSections(["ARIF"]);
    expect(s.map((x) => x.key)).toEqual(["muddakir"]);
    expect(s[0].items).toEqual([
      { label: L.muddakirHifazi, href: "/admin/muddakir" },
      { label: L.muddakirWeekly, href: "/muddakir/supervisor" },
    ]);
  });

  it("المناهج: القاعدة المدنية أوّلاً ثمّ مراقي", () => {
    expect(hrefsOf(["STUDENT"], "programs")).toEqual(["/programs/civil-base", "/programs/maraqi"]);
  });
});

// ── أدوار المدّكر المُحصَّرة (§٢): شريطٌ بلا دورٍ عامّ (محفوظٌ كما كان) ──
describe("navSections — أدوار المدّكر المُحصَّرة", () => {
  it("مدير برنامجٍ صرفٌ (MANAGER) ⟵ «إدارة المُدَّكِر» بكامل مداخله", () => {
    const s = navSections([], ["MANAGER"]);
    expect(s.map((x) => x.key)).toEqual(["muddakirAdmin"]);
    const h = s[0].items.map((i) => i.href);
    for (const href of ["/admin/muddakir", "/admin/muddakir/requests", "/admin/muddakir/staff", "/admin/muddakir/tathbit", "/muddakir/supervisor", "/muddakir/recitation"]) {
      expect(h).toContain(href);
    }
  });

  it("إداريٌّ صرفٌ (ADMIN) ⟵ بلا طاقمٍ ولا لقاءٍ/سرد، وطلباته «طلباتي»", () => {
    const s = navSections([], ["ADMIN"]);
    expect(s.map((x) => x.key)).toEqual(["muddakirAdmin"]);
    const items = s[0].items;
    expect(items.find((i) => i.href === "/admin/muddakir/requests")!.label).toBe(L.muddakirMyRequests);
    expect(items.map((i) => i.href)).not.toContain("/admin/muddakir/staff");
    expect(items.map((i) => i.href)).not.toContain("/muddakir/supervisor");
  });

  it("مشرفٌ خاصٌّ (SUPERVISOR) ⟵ «المُدَّكِر» (حفّاظي واللقاء)", () => {
    const s = navSections([], ["SUPERVISOR"]);
    expect(s.map((x) => x.key)).toEqual(["muddakir"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/admin/muddakir", "/muddakir/supervisor"]);
  });

  it("مختبِرٌ خاصٌّ (EXAMINER) ⟵ «سرد المُدَّكِر»", () => {
    const s = navSections([], ["EXAMINER"]);
    expect(s.map((x) => x.key)).toEqual(["muddakirExam"]);
    expect(s[0].items.map((i) => i.href)).toEqual(["/muddakir/recitation"]);
  });

  it("بلا roles وبلا أدوار مدّكر ⟵ []", () => {
    expect(navSections([], [])).toEqual([]);
  });
});
