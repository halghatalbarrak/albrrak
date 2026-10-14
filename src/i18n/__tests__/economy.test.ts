import { describe, expect, it } from "vitest";

import { economyAr, tEconomy } from "../ar/economy";

describe("قاموس اقتصاد النقاط (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tEconomy("listTitle")).toBe("بنود النقاط");
    expect(tEconomy("colName")).toBe("البند");
    expect(tEconomy("add")).toBe("إضافة");
  });

  it("النصوص المنقولة مطابقةٌ للأصل حرفاً بحرف", () => {
    // عناوين الشاشات ومسار التنقّل
    expect(tEconomy("listTitle")).toBe("بنود النقاط");
    expect(tEconomy("newTitle")).toBe("بندٌ جديد");
    expect(tEconomy("editTitle")).toBe("تعديل بند");
    expect(tEconomy("crumbHome")).toBe("الرئيسة");
    expect(tEconomy("crumbAdmin")).toBe("الإدارة");
    expect(tEconomy("crumbPoints")).toBe("النقاط");
    expect(tEconomy("crumbNew")).toBe("جديد");
    expect(tEconomy("crumbEdit")).toBe("تعديل");

    // حالات التحميل والأخطاء
    expect(tEconomy("loading")).toBe("جارٍ التحميل…");
    expect(tEconomy("errNoPermission")).toBe("لا صلاحية — هذه الشاشة للإدارة.");
    expect(tEconomy("errFetchItems")).toBe("تعذّر جلب البنود.");
    expect(tEconomy("errFetchItem")).toBe("تعذّر جلب البند.");
    expect(tEconomy("errToggle")).toBe("تعذّر تغيير الحالة.");
    expect(tEconomy("errSave")).toBe("تعذّر الحفظ.");
    expect(tEconomy("errItemNotFound")).toBe("البند غير موجود.");

    // أعمدة الجدول
    expect(tEconomy("colName")).toBe("البند");
    expect(tEconomy("colValue")).toBe("القيمة");
    expect(tEconomy("colSource")).toBe("المصدر");
    expect(tEconomy("colLimit")).toBe("الحدّ");
    expect(tEconomy("colState")).toBe("الحالة");
    expect(tEconomy("colAction")).toBe("إجراء");

    // عرض الحدّ والحالة
    expect(tEconomy("noLimit")).toBe("بلا حدّ");
    expect(tEconomy("stateActive")).toBe("مُفعَّل");
    expect(tEconomy("stateInactive")).toBe("معطَّل");

    // أزرار الجدول والقائمة
    expect(tEconomy("edit")).toBe("تعديل");
    expect(tEconomy("deactivate")).toBe("تعطيل");
    expect(tEconomy("activate")).toBe("تفعيل");
    expect(tEconomy("newItem")).toBe("+ جديد");
    expect(tEconomy("listDescription")).toBe(
      "القيمة الموجبة كسبٌ والسالبة خصم. المصدر يحدّد من يمنح (المعلّم/الإدارة)؛ والتلقائيّ يمنحه النظام عند حدثٍ تختاره. الحدّ عددُ مرّاتٍ في فترة. تعطيلٌ لا حذف.",
    );
    expect(tEconomy("listEmpty")).toBe("لا بنود بعد — أضِف أوّل بند بزرّ «+ جديد».");

    // مصدر المنح
    expect(tEconomy("sourceAuto")).toBe("تلقائيّ (النظام)");
    expect(tEconomy("sourceTeacher")).toBe("المعلّم");
    expect(tEconomy("sourceAdmin")).toBe("الإدارة");

    // فترة الحدّ
    expect(tEconomy("periodDay")).toBe("يوميّ");
    expect(tEconomy("periodWeek")).toBe("أسبوعيّ");
    expect(tEconomy("periodNone")).toBe("بلا حدّ");

    // أنواع الأحداث
    expect(tEconomy("eventAttendance")).toBe("حضور (عامّ — خامد، استعمل المفصّلة)");
    expect(tEconomy("eventHizbExamPass")).toBe("اجتياز الحزب");
    expect(tEconomy("eventStageExamPass")).toBe("اجتياز اختبار المرحلة");
    expect(tEconomy("eventDailyHarvest")).toBe("إتمام الحصاد اليوميّ");
    expect(tEconomy("eventPromotion")).toBe("ترقية/انتقال المرحلة");
    expect(tEconomy("eventQaidahComplete")).toBe("إتمام القاعدة المدنية");
    expect(tEconomy("eventAttendancePresent")).toBe("حضور: حاضر");
    expect(tEconomy("eventAttendanceLate")).toBe("حضور: متأخّر");
    expect(tEconomy("eventAttendanceAbsent")).toBe("حضور: غائب");
    expect(tEconomy("eventAttendanceLeftNoPermission")).toBe("حضور: خرج بدون إذن");
    expect(tEconomy("eventHifzDone")).toBe("الحفظ: أتقن");
    expect(tEconomy("eventHifzMissed")).toBe("الحفظ: لم يُتقن");
    expect(tEconomy("eventTarseekhDone")).toBe("الترسيخ: تمّ");
    expect(tEconomy("eventTarseekhMissed")).toBe("الترسيخ: لم يتمّ");
    expect(tEconomy("eventMurajaahDone")).toBe("المراجعة: تمّت");
    expect(tEconomy("eventMurajaahMissed")).toBe("المراجعة: لم تتمّ");
    expect(tEconomy("eventHifzExtra")).toBe("الحفظ: زيادة");
    expect(tEconomy("eventTarseekhExtra")).toBe("الترسيخ: زيادة");
    expect(tEconomy("eventMurajaahExtra")).toBe("المراجعة: زيادة");

    // حقول النموذج
    expect(tEconomy("fieldName")).toBe("الاسم");
    expect(tEconomy("fieldNamePlaceholder")).toBe("مثال: إتقان الحفظ");
    expect(tEconomy("fieldValue")).toBe("القيمة (موجب كسب / سالب خصم)");
    expect(tEconomy("fieldValuePlaceholder")).toBe("5 أو -2");
    expect(tEconomy("fieldSource")).toBe("مصدر المنح");
    expect(tEconomy("fieldPeriod")).toBe("فترة الحدّ");
    expect(tEconomy("fieldLimitCount")).toBe("عدد المرّات في الفترة");
    expect(tEconomy("fieldLimitCountPlaceholder")).toBe("مثال: 1");
    expect(tEconomy("fieldEvent")).toBe("الحدث المربوط (يمنحه النظام تلقائياً)");

    // أزرار النموذج
    expect(tEconomy("saving")).toBe("جارٍ…");
    expect(tEconomy("saveEdit")).toBe("حفظ التعديل");
    expect(tEconomy("add")).toBe("إضافة");
    expect(tEconomy("cancel")).toBe("إلغاء");
  });

  it("كل القيم نصوصٌ غير فارغة", () => {
    for (const v of Object.values(economyAr)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
