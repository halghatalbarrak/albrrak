// قاموس نصوص اقتصاد النقاط (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في شاشات
// الإدارة » النقاط. يُستدعى بمفتاحٍ عبر tEconomy، تمهيداً لإضافة الإنجليزيّة والروسيّة لاحقاً
// (قواميس موازية بالمفاتيح نفسها). لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.

export const economyAr = {
  // عناوين الشاشات ومسار التنقّل (crumbs)
  listTitle: "بنود النقاط",
  newTitle: "بندٌ جديد",
  editTitle: "تعديل بند",
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbPoints: "النقاط",
  crumbNew: "جديد",
  crumbEdit: "تعديل",

  // حالات التحميل والأخطاء
  loading: "جارٍ التحميل…",
  errNoPermission: "لا صلاحية — هذه الشاشة للإدارة.",
  errFetchItems: "تعذّر جلب البنود.",
  errFetchItem: "تعذّر جلب البند.",
  errToggle: "تعذّر تغيير الحالة.",
  errSave: "تعذّر الحفظ.",
  errItemNotFound: "البند غير موجود.",

  // أعمدة الجدول
  colName: "البند",
  colValue: "القيمة",
  colSource: "المصدر",
  colLimit: "الحدّ",
  colState: "الحالة",
  colAction: "إجراء",

  // عرض الحدّ والحالة
  noLimit: "بلا حدّ",
  stateActive: "مُفعَّل",
  stateInactive: "معطَّل",

  // أزرار الجدول والقائمة
  edit: "تعديل",
  deactivate: "تعطيل",
  activate: "تفعيل",
  newItem: "+ جديد",
  listDescription:
    "القيمة الموجبة كسبٌ والسالبة خصم. المصدر يحدّد من يمنح (المعلّم/الإدارة)؛ والتلقائيّ يمنحه النظام عند حدثٍ تختاره. الحدّ عددُ مرّاتٍ في فترة. تعطيلٌ لا حذف.",
  listEmpty: "لا بنود بعد — أضِف أوّل بند بزرّ «+ جديد».",

  // مصدر المنح (SOURCE_AR)
  sourceAuto: "تلقائيّ (النظام)",
  sourceTeacher: "المعلّم",
  sourceAdmin: "الإدارة",

  // فترة الحدّ (PERIOD_AR)
  periodDay: "يوميّ",
  periodWeek: "أسبوعيّ",
  periodNone: "بلا حدّ",

  // أنواع الأحداث للربط التلقائيّ (EVENT_AR)
  eventAttendance: "حضور (عامّ — خامد، استعمل المفصّلة)",
  eventHizbExamPass: "اجتياز الحزب",
  eventStageExamPass: "اجتياز اختبار المرحلة",
  eventDailyHarvest: "إتمام الحصاد اليوميّ",
  eventPromotion: "ترقية/انتقال المرحلة",
  eventQaidahComplete: "إتمام القاعدة المدنية",
  eventAttendancePresent: "حضور: حاضر",
  eventAttendanceLate: "حضور: متأخّر",
  eventAttendanceAbsent: "حضور: غائب",
  eventAttendanceLeftNoPermission: "حضور: خرج بدون إذن",
  eventHifzDone: "الحفظ: أتقن",
  eventHifzMissed: "الحفظ: لم يُتقن",
  eventTarseekhDone: "الترسيخ: تمّ",
  eventTarseekhMissed: "الترسيخ: لم يتمّ",
  eventMurajaahDone: "المراجعة: تمّت",
  eventMurajaahMissed: "المراجعة: لم تتمّ",
  eventHifzExtra: "الحفظ: زيادة",
  eventTarseekhExtra: "الترسيخ: زيادة",
  eventMurajaahExtra: "المراجعة: زيادة",

  // حقول النموذج (EconomyForm)
  fieldName: "الاسم",
  fieldNamePlaceholder: "مثال: إتقان الحفظ",
  fieldValue: "القيمة (موجب كسب / سالب خصم)",
  fieldValuePlaceholder: "5 أو -2",
  fieldSource: "مصدر المنح",
  fieldPeriod: "فترة الحدّ",
  fieldLimitCount: "عدد المرّات في الفترة",
  fieldLimitCountPlaceholder: "مثال: 1",
  fieldEvent: "الحدث المربوط (يمنحه النظام تلقائياً)",

  // أزرار النموذج
  saving: "جارٍ…",
  saveEdit: "حفظ التعديل",
  add: "إضافة",
  cancel: "إلغاء",
} as const;

/** مفاتيح قاموس اقتصاد النقاط (للتحقّق الثابت عند الاستدعاء). */
export type EconomyKey = keyof typeof economyAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس اقتصاد النقاط. */
export function tEconomy(key: EconomyKey): string {
  return economyAr[key];
}
