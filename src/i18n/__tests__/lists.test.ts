import { describe, expect, it } from "vitest";

import { listsAr, tLists } from "../ar/lists";

describe("قاموس شاشات القوائم (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tLists("listTitle")).toBe("إدارة القوائم");
    expect(tLists("newBtn")).toBe("+ جديد");
    expect(tLists("sectionNationalities")).toBe("الجنسيات");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof listsAr, string> = {
      crumbHome: "الرئيسة",
      crumbAdmin: "الإدارة",
      crumbLists: "القوائم",
      crumbNew: "جديدة",
      errForbidden: "لا صلاحية — هذه الشاشة للمدير.",
      errLoadLists: "تعذّر جلب القوائم.",
      errChangeState: "تعذّر تغيير الحالة.",
      errValueRequired: "القيمة مطلوبة.",
      errAdd: "تعذّرت الإضافة.",
      listTitle: "إدارة القوائم",
      loading: "جارٍ التحميل…",
      newBtn: "+ جديد",
      intro: "إضافةٌ وتعطيل (لا حذف — القيمة قد ترتبط بطلباتٍ سابقة). المعطَّل لا يظهر في نموذج القيد.",
      filterPlaceholder: "تصفية بالاسم…",
      sectionNationalities: "الجنسيات",
      sectionSchoolStages: "المراحل الدراسية",
      sectionGuardianRelations: "صفات القرابة",
      colValue: "القيمة",
      colState: "الحالة",
      colAction: "إجراء",
      stateActive: "مُفعَّلة",
      stateInactive: "معطَّلة",
      actDeactivate: "تعطيل",
      actActivate: "تفعيل",
      emptyValues: "لا قيم.",
      kindNationality: "جنسية",
      kindSchoolStage: "مرحلة دراسية",
      kindGuardianRelation: "صفة قرابة",
      newTitle: "قيمة جديدة",
      fieldList: "القائمة",
      fieldValue: "القيمة",
      valuePlaceholder: "قيمة جديدة…",
      savingBtn: "جارٍ…",
      addBtn: "إضافة",
      cancelBtn: "إلغاء",
    };
    for (const key of Object.keys(expected) as (keyof typeof listsAr)[]) {
      expect(tLists(key)).toBe(expected[key]);
    }
  });
});
