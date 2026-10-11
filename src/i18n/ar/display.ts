// قاموس نصوص الشاشة التحفيزيّة (العربيّة). الأرقام مشرقيّة في طبقة العرض، RTL.

export const displayAr = {
  // شاشة المدير (ش٣)
  adminTitle: "الشاشة التحفيزيّة",
  screens: "الشاشات",
  createScreen: "إنشاء شاشة",
  kindMosque: "شاشة مسجد",
  kindHome: "شاشة بيت",
  screenName: "اسم الشاشة",
  linkedSon: "الابن المرتبط",
  searchStudent: "ابحث عن طالبٍ بالاسم",
  genLink: "توليد الرابط",
  renewLink: "تجديد الرابط",
  revokeLink: "إلغاء الرابط",
  linkShownOnce: "انسخ الرابط الآن — لا يظهر بعدها (لمن فقده: تجديد)",
  copy: "نسخ",
  hasLink: "له رابطٌ فعّال",
  noLink: "بلا رابط",
  slides: "الشرائح",
  addProgramSlide: "إضافة شريحة برنامج",
  addImageSlide: "رفع صورة",
  selectProgram: "اختر برنامجًا",
  durationSec: "المدّة (ثوانٍ)",
  activeLabel: "مفعّلة",
  moveUp: "أعلى",
  moveDown: "أسفل",
  disable: "تعطيل",
  enable: "تفعيل",
  background: "الخلفيّة",
  uploadMosqueBg: "رفع خلفيّة المسجد",
  uploadHomeBg: "رفع خلفيّة البيت",
  programSlide: "برنامج",
  imageSlide: "صورة",
  noScreens: "لا شاشات بعد.",
  saved: "حُفِظ",
  openTv: "فتح على التلفاز",

  // صفحة العرض (ش٤)
  pointsWord: "نقطة",
  rankWord: "الترتيب",
  streakWord: "السلسلة",
  dayWord: "يوم",
  loadingTv: "…جارٍ التحميل",
  unavailable: "الشاشة غير متاحة.",
  sonBadge: "ابنك",
} as const;

export type DisplayKey = keyof typeof displayAr;
export function tDisplay(key: DisplayKey): string {
  return displayAr[key];
}
