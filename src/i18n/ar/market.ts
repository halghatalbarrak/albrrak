// قاموس نصوص سوق البيدر (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في شاشات السوق.
// يُستدعى بمفتاحٍ عبر tMarket، تمهيداً لإضافة الإنجليزيّة والروسيّة لاحقاً (قواميس موازية
// بالمفاتيح نفسها). المصطلحات استعارةٌ زراعيّة (الثمرة/البيدر) — تُنقل كما هي حرفاً بحرف.
// لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.

export const marketAr = {
  // رسائل الخطأ والتحميل (page.tsx و[id]/edit)
  errNoPermission: "لا صلاحية — هذه الشاشة للإدارة.",
  errFetchItems: "تعذّر جلب الثمار.",
  errFetchItem: "تعذّر جلب الثمرة.",
  errItemNotFound: "الثمرة غير موجودة.",
  errDoAction: "تعذّر تنفيذ الإجراء.",
  errToggleState: "تعذّر تغيير الحالة.",
  errSave: "تعذّر الحفظ.",
  loading: "جارٍ التحميل…",

  // عنوان الشاشة ومسار التنقّل (page.tsx)
  pageTitle: "ثمار البيدر",
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbBaydar: "البيدر",

  // أعمدة الجدول وخلاياه (page.tsx)
  colName: "الثمرة",
  colPrice: "قيمة الثمرة",
  colStock: "المتوفّر",
  colState: "الحالة",
  colAction: "إجراء",
  pointUnit: "نقطة",
  noLimit: "بلا حدّ",
  stateActive: "مُفعَّل",
  stateInactive: "معطَّل",
  actEdit: "تعديل",
  actDeactivate: "تعطيل",
  actActivate: "تفعيل",

  // قسم ثمرات الوليّ المعلّقة (page.tsx)
  giftsTitle: "ثمرات بانتظار الموافقة",
  giftsHint: "ثمرات أضافها أولياء الأمور. اعتمِد القيمة المقترحة أو عدّلها، أو ارفض.",
  giftGeneral: "عامّة لكلّ البيدر",
  giftProposedBy: "اقترحها",
  giftApprovedValue: "القيمة المعتمَدة",
  giftApprove: "اعتماد",
  giftReject: "رفض",

  // شريط الأدوات والجدول (page.tsx)
  listHint: "قيمة الثمرة بالنقاط. المتوفّر فارغٌ = بلا حدّ. أمين البيدر لا يُدخل القيمة — تُخصَم المثبّتة هنا. تعطيلٌ لا حذف.",
  newBtn: "+ جديد",
  tableEmpty: "لا ثمار بعد — أضِف أوّل ثمرة بزرّ «+ جديد».",

  // عناوين صفحتي الإضافة والتعديل ومساراتهما (new/page.tsx و[id]/edit/page.tsx)
  newPageTitle: "ثمرةٌ جديدة",
  crumbNew: "جديدة",
  editPageTitle: "تعديل ثمرة",
  crumbEdit: "تعديل",

  // نموذج الثمرة (shared.tsx)
  formName: "الاسم",
  formNamePlaceholder: "مثال: قلم رصاص",
  formPrice: "قيمة الثمرة (نقاط)",
  formPricePlaceholder: "10",
  formStock: "المتوفّر (اتركه فارغًا = بلا حدّ)",
  formStockPlaceholder: "بلا حدّ",
  formImageUrl: "رابط الصورة (اختياريّ)",
  formImageUrlPlaceholder: "https://…",
  formSaving: "جارٍ…",
  formSaveEdit: "حفظ التعديل",
  formAdd: "إضافة",
  formCancel: "إلغاء",
} as const;

/** مفاتيح قاموس سوق البيدر (للتحقّق الثابت عند الاستدعاء). */
export type MarketKey = keyof typeof marketAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس سوق البيدر. */
export function tMarket(key: MarketKey): string {
  return marketAr[key];
}
