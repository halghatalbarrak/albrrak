export const donorAr = {
  pageTitle: "لوحة المانح",
  pageSubtitle: "مؤشّراتٌ مجمّعةٌ — بلا بياناتٍ شخصيّة",

  // بطاقات المؤشّرات
  cardStudents: "الطلاب النشطون",
  cardCircles: "الحلقات النشطة",
  cardAttendance30: "الحضور (٣٠ يوماً)",
  cardMastered30: "جلسات حفظٍ مُتقَنة (٣٠ يوماً)",
  cardKhatm: "طلاب أتمّوا حفظ القرآن",

  // جدول الاتجاه الشهريّ
  trendTitle: "الاتجاه الشهريّ",
  trendColMonth: "الشهر",
  trendColAttendance: "سجلّات الحضور",
  trendColPresent: "الحاضرون",
  trendColSessions: "الجلسات",
  trendColRate: "نسبة الحضور",

  noData: "لا بيانات متاحة",
  loading: "جارٍ التحميل…",
  errLoad: "تعذّر تحميل الإحصاءات",
  unit_students: "طالب",
  unit_circles: "حلقة",
  unit_sessions: "جلسة",
} as const;

export function tDonor<K extends keyof typeof donorAr>(key: K): string {
  return donorAr[key];
}
