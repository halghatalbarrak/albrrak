export const analyticsAr = {
  pageTitle: "التحليلات الموحّدة",
  pageSubtitle: "مؤشّرات المنصّة وأداء الحلقات",

  // مبدّل الفترة
  periodDay: "يومي",
  periodWeek: "أسبوعي",
  periodMonth: "شهري",

  // مؤشّرات الحلقات
  grpCircles: "الحلقات",
  kpiActiveStudents: "الطلاب النشطون",
  kpiAttendanceRate: "نسبة الحضور",
  kpiMasteredSessions: "جلسات مُتقَنة",
  kpiKhatm: "الخاتمون",
  kpiStruggling: "جلسات متعثّرة",

  // مؤشّرات مُدّكِر
  grpMuddakir: "مُدَّكِر",
  kpiActiveHuffaz: "الحفّاظ النشطون",
  kpiCompletedDays: "أيام مكتملة",

  // الرسوم
  chartAttendanceTitle: "الحضور",
  chartSessionsTitle: "الجلسات المُتقَنة",
  chartMuddakirTitle: "أيام المُدَّكِر",
  chartPresent: "حاضر",
  chartTotal: "إجمالي",
  chartCompleted: "مكتمل",

  // جدول الحلقات
  tableCircleName: "الحلقة",
  tableStudents: "الطلاب",
  tablePresent: "حاضر",
  tableTotal: "الإجمالي",
  tableRate: "نسبة الحضور",
  tableSessions: "الجلسات",
  tableNoCircles: "لا حلقات مسجّلة",

  // حالات
  loading: "جارٍ تحميل البيانات…",
  errLoad: "تعذّر تحميل التحليلات.",
  noData: "لا بيانات للفترة المحدّدة.",
  donorNote: "البيانات مجمّعة — لا أسماء لحفظ الخصوصية.",

  // وحدات
  unit_students: "طالب",
  unit_sessions: "جلسة",
  unit_days: "يوم",
  unit_pct: "٪",
} as const;

export type AnalyticsKey = keyof typeof analyticsAr;
export function tA(key: AnalyticsKey): string { return analyticsAr[key]; }
