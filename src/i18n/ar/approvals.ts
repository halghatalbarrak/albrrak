// قاموس نصوص لوحة اعتماد المدير (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في الشاشة.
// يُستدعى بمفتاحٍ عبر tApprovals، تمهيداً لإضافة لغاتٍ موازية لاحقاً (بالمفاتيح نفسها).

export const approvalsAr = {
  // عنوان الشاشة ومسار التنقّل
  title: "الاعتمادات",
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbApprovals: "الاعتمادات",

  // المراتب (RANK)
  rankExcellent: "تميّز",
  rankPass: "اجتياز",
  rankFail: "رسوب",

  // رسائل التنبيه
  rejectNeedsReason: "الرفض يستلزم سببًا.",
  decideFailed: "تعذّر حسم الاقتراح.",

  // الحقول والأزرار
  rejectReasonPlaceholder: "سبب الرفض (عند الرفض)",
  approveBtn: "اعتماد",
  rejectBtn: "رفض",

  // أعمدة جدول انتقال المرحلة
  colStudent: "الطالب",
  colStage: "المرحلة",
  colRank: "المرتبة",
  colRejectReason: "سبب الرفض",
  colActions: "إجراءات",

  // أعمدة جدول التخرّج
  colStatus: "الحالة",
  threeRoundsDone: "اكتملت ثلاث جولات",

  // شاشة عدم الصلاحية
  needManagerLogin: "تحتاج دخولًا كمدير.",
  login: "دخول",

  // حالات التحميل والخطأ
  loading: "…جارٍ التحميل",
  loadFailed: "تعذّر التحميل.",
  retry: "إعادة",

  // الحالة الفارغة
  emptyTitle: "لا اعتمادات معلّقة",
  emptyDescription: "لا اقتراحات انتقالٍ أو تخرّجٍ بانتظارك الآن.",

  // أقسام الصفحة
  stageSectionTitle: "انتقال المرحلة",
  stageSectionNote: "اعتمادُك ينقل الطالب للمرحلة الأصلية التالية.",
  noPendingTransitions: "لا اقتراحات انتقالٍ معلَّقة.",
  graduationSectionTitle: "التخرّج",
  graduationSectionNote: "اعتمادُك يخرّج الطالب ويُصدر شهادة الختم.",
  noPendingGraduations: "لا اقتراحات تخرّجٍ معلَّقة.",
} as const;

/** مفاتيح قاموس لوحة الاعتماد (للتحقّق الثابت عند الاستدعاء). */
export type ApprovalsKey = keyof typeof approvalsAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس لوحة الاعتماد. */
export function tApprovals(key: ApprovalsKey): string {
  return approvalsAr[key];
}
