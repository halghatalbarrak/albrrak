import { describe, expect, it } from "vitest";

import { applyAr, tApply } from "../ar/apply";

describe("قاموس صفحة القيد (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tApply("formTitle")).toBe("نموذج القيد");
    expect(tApply("submit")).toBe("إرسال طلب القيد");
  });

  it("النصوص المنقولة مطابقةٌ للأصل حرفاً بحرف", () => {
    expect(tApply("brand")).toBe("حلقات الشيخ محمد البراك");
    expect(tApply("loading")).toBe("جارٍ التحميل…");
    expect(tApply("loadErrorTitle")).toBe("تعذّر تحميل النموذج");
    expect(tApply("loadErrorBody")).toBe("حدث خطأ أثناء جلب البيانات. حاول مرة أخرى.");
    expect(tApply("retry")).toBe("إعادة المحاولة");
    expect(tApply("okTitle")).toBe("تمّ استلام طلب القيد");
    expect(tApply("okBody")).toBe("سيُنظر فيه ويُبلَّغ وليّ الأمر بالنتيجة إن شاء الله.");
    expect(tApply("formTitle")).toBe("نموذج القيد");
    expect(tApply("step1Lead")).toBe("حلقات الشيخ محمد البراك — تُملأ بلا حساب.");
    expect(tApply("fieldBirthDate")).toBe("تاريخ الميلاد (ميلادي)");
    expect(tApply("next")).toBe("التالي");
    expect(tApply("childLead")).toBe("هذا الطالب دون الثالثة عشرة. على ولي الأمر تعبئة البيانات.");
    expect(tApply("adultLead")).toBe("الطالب هو من يعبّئ بياناته.");
    expect(tApply("editBirthDate")).toBe("← تعديل تاريخ الميلاد");
    expect(tApply("noNationalities")).toBe("قوائم الجنسيات غير متاحة حاليًا — تعذّر إتمام النموذج. أبلغ الإدارة.");
    expect(tApply("fieldNameAsInId")).toBe("الاسم كما في الهوية");
    expect(tApply("fieldNationalId")).toBe("رقم الهوية");
    expect(tApply("fieldNationality")).toBe("الجنسية (اكتب للبحث)");
    expect(tApply("fieldGender")).toBe("الجنس");
    expect(tApply("fieldSchoolStage")).toBe("المرحلة الدراسية");
    expect(tApply("fieldGuardianPhone")).toBe("جوال ولي الأمر (يبدأ بـ 966)");
    expect(tApply("fieldGuardianEmail")).toBe("بريد ولي الأمر (اختياريّ — لتصله تقارير الأسبوع)");
    expect(tApply("fieldGuardianGender")).toBe("جنس ولي الأمر");
    expect(tApply("fieldGuardianRelation")).toBe("صفة ولي الأمر");
    expect(tApply("fieldPriorHifz")).toBe("مقدار الحفظ (بالأجزاء)");
    expect(tApply("fieldStudentPhone")).toBe("جوال الطالب");
    expect(tApply("studentPhoneRequired")).toBe("(إلزامي — شرط حسابه)");
    expect(tApply("studentPhoneOptional")).toBe("(اختياري)");
    expect(tApply("genderMale")).toBe("ذكر");
    expect(tApply("genderFemale")).toBe("أنثى");
    expect(tApply("optionDash")).toBe("—");
    expect(tApply("optionChoose")).toBe("اختر…");
    expect(tApply("emergencyLegend")).toBe("جهة اتصال الطوارئ — حين لا يردّ ولي الأمر");
    expect(tApply("emergencyName")).toBe("الاسم");
    expect(tApply("emergencyPhone")).toBe("الجوال (يخالف جوال ولي الأمر)");
    expect(tApply("emergencyRelation")).toBe("الصفة");
    expect(tApply("sending")).toBe("جارٍ الإرسال…");
    expect(tApply("submit")).toBe("إرسال طلب القيد");
    expect(tApply("errSelectNationality")).toBe("اختر الجنسية من القائمة.");
    expect(tApply("errSendApplication")).toBe("تعذّر إرسال الطلب.");
    expect(tApply("errConnect")).toBe("تعذّر الاتصال بالخادم.");
  });

  it("كل القيم نصوصٌ غير فارغة", () => {
    for (const v of Object.values(applyAr)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
