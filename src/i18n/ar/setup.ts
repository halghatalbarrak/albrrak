// نصوص لوحة «إعداد الطالب» — العربية.

export const setupAr = {
  panelTitle: "إعدادات ناقصة",
  panelSubtitle: "أكمل هذه الخطوات ليبدأ الطالب حفظه.",
  badgeNeedsSetup: "يحتاج إعداداً",
  filterIncomplete: "إعداد ناقص",
  completeCount: (n: number) => `${toAr(n)} خطوة ناقصة`,

  // موانع
  noProgram: "لم يُسكَّن في برنامج.",
  noProgramAction: "صفحة التسكين",
  readingTest: "بانتظار اختبار القراءة.",
  readingTestPending: "اختبار القراءة بانتظار اعتماد المدير.",
  readingTestPropose: "اقتراح قرار التحديد",
  readingTestApprove: "اعتماد القرار",
  frontier: "لم تُحدَّد نقطة البداية (التسكين).",
  frontierSetFrontier: "تحديد نقطة البداية",
  frontierNoPrior: "لا محفوظ سابق — يبدأ من الفاتحة",
  frontierHasPrior: "لديه محفوظ سابق — تحديد الموضع",
  noTrack: "لم يُسنَد مسار حفظ.",
  noTrackAction: "تحديد المسار",
  noTrackSuggest: "المقترح:",

  // تنبيهات
  noGuardian: "لا ولي أمر مرتبط (دون ١٨).",
  noGuardianAction: "ربط ولي الأمر",
  noPhone: "لا جوال مسجَّل (١٣+).",
  noPhoneAction: "تعديل بيانات المستخدم",

  // أزرار مشتركة
  save: "حفظ",
  cancel: "إلغاء",
  next: "التالي",
  done: "تمّ",
  saving: "جارٍ الحفظ…",
} as const;

export type SetupKey = keyof typeof setupAr;

export function tSetup(key: Exclude<SetupKey, "completeCount">): string;
export function tSetup(key: "completeCount", n: number): string;
export function tSetup(key: SetupKey, n?: number): string {
  const v = setupAr[key];
  if (typeof v === "function") return (v as (n: number) => string)(n ?? 0);
  return v;
}

/** أرقام مشرقية (عربيّة هنديّة). */
function toAr(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}
