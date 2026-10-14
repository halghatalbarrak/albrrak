// قاموس نصوص شاشة منح النقاط (الإدارة/التشغيل) — العربيّة. المصدر الوحيد لكل نصٍّ يظهر
// للمستخدم في صفحة admin/grant-points. يُستدعى بمفتاحٍ عبر tGrantPoints، تمهيداً لإضافة
// لغاتٍ موازيةٍ لاحقاً بالمفاتيح نفسها. لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.
// الأجزاء المتغيّرة (أسماء الطلاب/البنود، الأعداد، علامتا +/−) تُركَّب في الصفحة.

export const grantPointsAr = {
  // مسارات التنقّل (crumbs)
  crumbHome: "الرئيسة",
  crumbOperation: "التشغيل",
  crumbGrantPoints: "منح نقاط",

  // رسائل الخطأ/النجاح/الصلاحية
  errForbidden: "لا صلاحية — للمعلّم والإدارة.",
  errLoadData: "تعذّر جلب البيانات.",
  errSelectStudentAndItem: "اختر الطالب والبند.",
  errGrant: "تعذّر المنح.",
  okGranted: "تمّ المنح.",

  // الشاشة
  title: "منح نقاط",
  intro: "تمنح لطلاب حلقتك فقط، ومن البنود المسموحة لك. الخادم يرفض ما عدا ذلك.",
  fieldStudent: "الطالب",
  studentPlaceholder: "اختر طالبًا…",
  fieldItem: "البند",
  itemPlaceholder: "اختر بندًا…",
  fieldNote: "ملاحظة (اختياريّة)",
  notePlaceholder: "سبب المنح…",
  grantBtn: "منح",

  // جدول الحركات
  colItem: "البند",
  colPoints: "النقاط",
  colBy: "منحها",
  colNote: "ملاحظة",
  bySystem: "النظام",
  statCurrentBalance: "الرصيد الحاليّ",
  recentTransactions: "آخر الحركات",
  emptyTransactions: "لا حركات بعد.",
} as const;

/** مفاتيح قاموس منح النقاط (للتحقّق الثابت عند الاستدعاء). */
export type GrantPointsKey = keyof typeof grantPointsAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس منح النقاط. */
export function tGrantPoints(key: GrantPointsKey): string {
  return grantPointsAr[key];
}
