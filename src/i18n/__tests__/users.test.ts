import { describe, expect, it } from "vitest";

import { usersAr, tUsers } from "../ar/users";

describe("قاموس إدارة المستخدمين (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tUsers("shellTitle")).toBe("المستخدمون");
    expect(tUsers("btnNew")).toBe("+ جديد");
    expect(tUsers("btnSave")).toBe("حفظ");
  });

  it("كلّ مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    expect(tUsers("errNoPermission")).toBe("لا صلاحية — إدارة المستخدمين للمشرف العام والمدير التقنيّ فقط.");
    expect(tUsers("errLoad")).toBe("تعذّر جلب المستخدمين.");
    expect(tUsers("errImpersonate")).toBe("تعذّر بدء الانتحال.");
    expect(tUsers("errToggleActive")).toBe("تعذّر تغيير الحالة.");
    expect(tUsers("errReset")).toBe("تعذّرت إعادة التعيين.");
    expect(tUsers("errSaveRoles")).toBe("تعذّر حفظ الأدوار.");
    expect(tUsers("resetLinkTitlePrefix")).toBe("رابط إعادة تعيين كلمة سرّ: ");
    expect(tUsers("saveRolesPartialPrefix")).toBe("حُفظت الأدوار العامّة، وتعذّر حفظ أدوار المدّكر: ");
    expect(tUsers("colName")).toBe("الاسم");
    expect(tUsers("colPhone")).toBe("الجوال");
    expect(tUsers("colRoles")).toBe("الأدوار");
    expect(tUsers("colState")).toBe("الحالة");
    expect(tUsers("colAction")).toBe("إجراء");
    expect(tUsers("badgeStudent")).toBe("طالب");
    expect(tUsers("stateActive")).toBe("مُفعّل");
    expect(tUsers("stateDisabled")).toBe("معطَّل");
    expect(tUsers("btnImpersonate")).toBe("انتحال");
    expect(tUsers("btnRoles")).toBe("الأدوار");
    expect(tUsers("btnReset")).toBe("إعادة تعيين");
    expect(tUsers("btnDisable")).toBe("تعطيل");
    expect(tUsers("btnEnable")).toBe("تفعيل");
    expect(tUsers("shellTitle")).toBe("المستخدمون");
    expect(tUsers("crumbHome")).toBe("الرئيسة");
    expect(tUsers("crumbUsers")).toBe("المستخدمون");
    expect(tUsers("loading")).toBe("جارٍ التحميل…");
    expect(tUsers("intro")).toBe("إضافة كادرٍ · تعطيل/تفعيل (لا حذف) · تعديل الأدوار · إعادة تعيين كلمة السرّ.");
    expect(tUsers("btnNew")).toBe("+ جديد");
    expect(tUsers("btnCloseLink")).toBe("إغلاق");
    expect(tUsers("tableEmpty")).toBe("لا مستخدمين.");
    expect(tUsers("rolesModalTitlePrefix")).toBe("أدوار: ");
    expect(tUsers("btnSave")).toBe("حفظ");
    expect(tUsers("btnCancel")).toBe("إلغاء");
    expect(tUsers("adminActorNote")).toBe("إجراؤك يُرسَل للاعتماد.");
    expect(tUsers("errCreate")).toBe("تعذّر إنشاء الكادر.");
    expect(tUsers("createRolesPartialPrefix")).toBe("أُنشئ الحساب، وتعذّر تعيين أدوار المدّكر: ");
    expect(tUsers("newShellTitle")).toBe("إضافة كادر");
    expect(tUsers("crumbUsersNav")).toBe("المستخدمون");
    expect(tUsers("crumbNewStaff")).toBe("كادر جديد");
    expect(tUsers("createdTitle")).toBe("أُنشئ الكادر ✓ — أرسِل له رابط التفعيل في واتساب");
    expect(tUsers("createdHint")).toBe("انسخ الرابط الآن؛ لن يظهر مرّةً أخرى.");
    expect(tUsers("btnBackToList")).toBe("رجوع للقائمة");
    expect(tUsers("fieldName")).toBe("الاسم");
    expect(tUsers("placeholderName")).toBe("اسم الكادر");
    expect(tUsers("fieldPhone")).toBe("الجوال");
    expect(tUsers("placeholderPhone")).toBe("9665… أو 05…");
    expect(tUsers("fieldRoles")).toBe("الأدوار");
    expect(tUsers("btnSaving")).toBe("جارٍ…");
    expect(tUsers("btnCreate")).toBe("إنشاء");
  });

  it("لا مفتاحٍ بقيمةٍ فارغة", () => {
    for (const [key, value] of Object.entries(usersAr)) {
      expect(value, key).not.toBe("");
    }
  });
});
