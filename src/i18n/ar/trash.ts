export const trashAr = {
  pageTitle: "سلّة المحذوفات",
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbTrash: "السلّة",

  colKind: "النوع",
  colLabel: "الاسم",
  colDeletedAt: "تاريخ الحذف",
  colDeletedBy: "بواسطة",
  colActions: "إجراءات",

  kindUser: "مستخدم",
  kindCircle: "حلقة",
  kindStudent: "طالب",

  restoreBtn: "استعادة",
  hardDeleteBtn: "حذف دائم",
  hardDeleteConfirmBtn: "تأكيد الحذف الدائم",
  cancelBtn: "إلغاء",

  restoring: "جارٍ الاستعادة…",
  deleting: "جارٍ الحذف…",

  empty: "لا عناصر محذوفة",
  fetchFailed: "تعذّر جلب السلّة.",
  restoreFailed: "تعذّر الاستعادة.",
  deleteFailed: "تعذّر الحذف الدائم.",

  hardDeleteWarning: "لا يمكن التراجع عن الحذف الدائم.",

  filterAll: "الكل",
  filterUsers: "المستخدمون",
  filterCircles: "الحلقات",
  filterStudents: "الطلاب",
} as const;

export type TrashKey = keyof typeof trashAr;

export function tTrash(key: TrashKey): string {
  return trashAr[key];
}
