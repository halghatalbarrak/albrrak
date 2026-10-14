// قاموس نصوص شاشة إسناد الطلاب للحلقات (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في الشاشة.
// يُستدعى بمفتاحٍ عبر tEnrollment، تمهيداً لإضافة لغاتٍ موازية لاحقاً (بالمفاتيح نفسها).
// لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.

export const enrollmentAr = {
  // عنوان الشاشة ومسار التنقّل
  title: "إسناد الطلاب للحلقات",
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbEnrollment: "القيد",

  // رسائل التنبيه والنجاح والخطأ
  needLogin: "تحتاج دخولًا.",
  pickCircleFirst: "اختر حلقة أولًا.",
  assignDone: "تمّ الإسناد/النقل.",
  assignFailed: "تعذّر الإسناد.",

  // أعمدة الجدول
  colName: "الاسم",
  colCurrentCircle: "الحلقة الحالية",
  colAssign: "الإسناد",
  colHistory: "السجلّ",

  // بلا حلقة / الإسناد
  noCircle: "بلا حلقة",
  selectCircle: "— اختر حلقة —",
  move: "نقل",
  assign: "إسناد",
  viewBtn: "عرض",

  // الحالات الفارغة والتنبيه
  emptyTitle: "لا طلاب",
  emptyDescription: "لا طلاب مقبولون للإسناد بعد.",
  unassignedNote: "طالبٍ بلا حلقة — أسنِدهم أولاً.",
  pendingAssignment: "بانتظار الإسناد",

  // نافذة السجلّ
  historyTitlePrefix: "سجلّ الإسناد — ",
  loading: "…جارٍ التحميل",
  noHistory: "لا سجلّ.",
  from: "من",
  to: "إلى",
  activeParen: "(نشط)",
} as const;

/** مفاتيح قاموس شاشة الإسناد (للتحقّق الثابت عند الاستدعاء). */
export type EnrollmentKey = keyof typeof enrollmentAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس شاشة الإسناد. */
export function tEnrollment(key: EnrollmentKey): string {
  return enrollmentAr[key];
}
