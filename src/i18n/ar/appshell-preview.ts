// قاموس نصوص صفحة معاينة الواجهة (العربيّة). يُستدعى عبر tAppshellPreview. حرفيّاً.

export const appshellPreviewAr = {
  nextStep: "الخطوة التالية",
  pendingApps5: "لديك ٥ طلبَ قيدٍ بانتظار المراجعة",
  reviewApps: "راجِع الطلبات",
  unifiedComponentsForm: "نموذجٌ بمكوّنات موحّدة",
  choose: "اختر…",
  fajrCircle: "حلقة الفجر",
  asrCircle: "حلقة العصر",
  openModal: "فتح نافذةٍ منبثقة",
  emptyState: "حالةُ فراغ",
  refresh: "تحديث",
  loadingSkeleton: "تحميل (Skeleton)",
  delete: "حذف",
  cancel: "إلغاء",
  modalExample: "هذا مثالٌ لنافذةٍ منبثقةٍ بهوية المنصّة — تُغلق بـ Esc أو بالنقر خارجها.",
} as const;

export type AppshellPreviewKey = keyof typeof appshellPreviewAr;

export function tAppshellPreview(key: AppshellPreviewKey): string {
  return appshellPreviewAr[key];
}
