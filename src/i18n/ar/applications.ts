// قاموس نصوص طلبات القيد (العربيّة) — النصوص المكتوبة مباشرةً في
// src/app/admin/applications/page.tsx.
// يُستدعى بمفتاحٍ عبر tApplications، تمهيداً لإضافة لغاتٍ أخرى لاحقاً (قواميس موازية بالمفاتيح نفسها).

export const applicationsAr = {
  // رسائل الخطأ (page.tsx)
  errNoPermission: "لا صلاحية — هذه الشاشة للمدير.",
  errLoad: "تعذّر جلب الطلبات.",
  errDecide: "تعذّر تنفيذ القرار.",
  errReveal: "تعذّر كشف رقم الهوية.",

  // نافذة سبب الرفض (page.tsx)
  rejectPrompt: "سبب الرفض (إلزامي):",

  // أعمدة الجدول (page.tsx)
  colName: "الاسم",
  colStatus: "الحالة",
  colInfo: "البيانات",
  colGuardian: "ولي الأمر",
  colHifz: "الحفظ",
  colActions: "إجراءات",

  // شارات الحالة والبيانات (page.tsx)
  statusWaitlisted: "قائمة الانتظار",
  statusNew: "جديد",
  genderMale: "ذكر",
  genderFemale: "أنثى",
  infoYearsUnit: "سنة", // «٢٠ سنة»
  hifzJuzUnit: "جزء", // «٣ جزء»

  // أزرار الصفّ (page.tsx)
  btnAccept: "قبول",
  btnReject: "رفض",
  btnWaitlist: "انتظار",
  btnRevealId: "كشف الهوية",
  revealedIdPrefix: "الهوية: ", // يليه رقم الهوية

  // AppShell والعنوان (page.tsx)
  shellTitlePrefix: "طلبات القيد", // قد يليه عددٌ بين قوسين
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbApplications: "الطلبات",

  // الفراغ والتحفيز (page.tsx)
  emptyTitle: "لا طلبات معلّقة",
  emptyDescription: "ستظهر هنا طلبات القيد الجديدة عند ورودها.",
  oldestPendingPrefix: "أقدم طلبٍ معلّق منذ ", // يليه العدد
  oldestPendingSuffix: " يومًا — ابدأ به.",
  pendingReviewSuffix: " بانتظار المراجعة", // يسبقه العدد
} as const;

/** مفاتيح قاموس طلبات القيد (للتحقّق الثابت عند الاستدعاء). */
export type ApplicationsKey = keyof typeof applicationsAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس طلبات القيد. */
export function tApplications(key: ApplicationsKey): string {
  return applicationsAr[key];
}
