// قاموس نصوص شاشات القوائم (الإدارة) — العربيّة. المصدر الوحيد لكل نصٍّ يظهر للمستخدم
// في صفحتَي admin/lists و admin/lists/new. يُستدعى بمفتاحٍ عبر tLists، تمهيداً لإضافة
// لغاتٍ موازيةٍ لاحقاً بالمفاتيح نفسها. لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.
// الأجزاء المتغيّرة (عدد العناصر، أسماء القيم) تُركَّب في الصفحة.

export const listsAr = {
  // مسارات التنقّل (crumbs) — مشتركةٌ بين الصفحتين
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbLists: "القوائم",
  crumbNew: "جديدة",

  // رسائل الخطأ/الصلاحية
  errForbidden: "لا صلاحية — هذه الشاشة للمدير.",
  errLoadLists: "تعذّر جلب القوائم.",
  errChangeState: "تعذّر تغيير الحالة.",
  errValueRequired: "القيمة مطلوبة.",
  errAdd: "تعذّرت الإضافة.",

  // شاشة القائمة (admin/lists)
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

  // شاشة القيمة الجديدة (admin/lists/new)
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
} as const;

/** مفاتيح قاموس القوائم (للتحقّق الثابت عند الاستدعاء). */
export type ListsKey = keyof typeof listsAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس القوائم. */
export function tLists(key: ListsKey): string {
  return listsAr[key];
}
