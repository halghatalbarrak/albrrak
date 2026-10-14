import { describe, expect, it } from "vitest";

import { circlesAr, tCircles } from "../ar/circles";

describe("قاموس شاشات الحلقات (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tCircles("listTitle")).toBe("الحلقات");
    expect(tCircles("newBtn")).toBe("+ جديد");
    expect(tCircles("weaknessMapLink")).toBe("خريطة الضعف");
  });

  it("كل مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    const expected: Record<keyof typeof circlesAr, string> = {
      crumbHome: "الرئيسة",
      crumbAdmin: "الإدارة",
      crumbCircles: "الحلقات",
      crumbNew: "جديدة",
      crumbMap: "الخريطة",
      errForbidden: "لا صلاحية — هذه الشاشة للمدير.",
      errLoadCircles: "تعذّر جلب الحلقات.",
      errChangeProgram: "تعذّر تغيير البرنامج الافتراضيّ.",
      errLoadPrograms: "تعذّر جلب البرامج.",
      errCreateCircle: "تعذّر إنشاء الحلقة.",
      errForbiddenMap: "لا صلاحية — لا تَرى إلا خريطة حلقتك.",
      errLoadMap: "تعذّر جلب الخريطة.",
      listTitle: "الحلقات",
      colName: "الاسم",
      colDefaultProgram: "البرنامج الافتراضيّ",
      colSlot: "الوقت",
      colGender: "الجنس",
      colLocation: "المكان",
      colMap: "الخريطة",
      weaknessMapLink: "خريطة الضعف",
      newBtn: "+ جديد",
      emptyTitle: "لا حلقات بعد",
      emptyDescription: "أنشئ الأولى بزرّ «+ جديد».",
      slotAsr: "العصر",
      slotMaghrib: "المغرب",
      genderMale: "بنون",
      genderFemale: "بنات",
      newTitle: "حلقة جديدة",
      fieldName: "الاسم",
      fieldProgram: "البرنامج",
      fieldSlot: "الوقت",
      fieldGender: "الجنس",
      fieldLocation: "المكان (اختياري)",
      selectPlaceholder: "اختر…",
      savingBtn: "جارٍ…",
      createBtn: "إنشاء",
      cancelBtn: "إلغاء",
      mapTitle: "خريطة ضعف الحلقة",
      studentSingular: "طالب",
      studentDual: "طالبان",
      studentPlural: "طلاب",
      mapEmptyTitle: "لا مواضع تعثّرٍ جماعيّ بعد",
      mapEmptyDescription: "تظهر الخريطة حين يتعثّر طلابٌ في آياتٍ بعينها خلال الحصاد.",
      mapHintLine1: "آيةٌ يتعثّر فيها عدّةٌ من طلابك = خللٌ في التلقين لا في الطلاب — علّمها الحلقةَ جماعةً.",
      mapHintLine2: "كلّما اشتدّ البرونزيّ كثُر المتعثّرون فيها.",
      mostStumbled: "أكثر المواضع تعثّرًا",
      surahWord: "سورة",
      ayahWord: "آية",
      stumbledIn: "تعثّر فيها",
      facesHeading: "الأوجه",
      faceOfPage: "وجه ص",
      positionWord: "موضعًا",
    };
    for (const key of Object.keys(expected) as (keyof typeof circlesAr)[]) {
      expect(tCircles(key)).toBe(expected[key]);
    }
  });
});
