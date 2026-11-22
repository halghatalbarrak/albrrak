export const reportAr = {
  title: "التقرير اليومي",
  today: "اليوم",
  prevDay: "‹ السابق",
  nextDay: "التالي ›",
  errLoad: "تعذّر جلب التقرير.",
  noReport: "لا تقرير متاح لهذا الدور.",

  // الحضور
  attendanceSummary: "ملخّص الحضور",
  total: "الإجمالي",
  present: "حاضر",
  late: "متأخّر",
  excused: "معذور",
  absent: "غائب",
  leftEarly: "انصرف مبكّرًا",
  notRecorded: "لم يُسجَّل",

  // جدول الطلاب
  studentName: "الطالب",
  attendanceCol: "الحضور",
  hifzCol: "الحفظ",
  attemptsCol: "المحاولات",
  tarseekhCol: "الترسيخ",
  murajaahCol: "المراجعة",
  done: "✓",
  notDone: "—",
  noSession: "لا جلسة",

  // من لم يُسمَّع
  notRecitedTitle: "لم يُسمَّع (حاضرٌ بلا جلسة)",
  noNotRecited: "الجميع سُمِّع ✓",

  // من تكرّر عنده مقطع
  repeatedTitle: "مقاطع متكرّرة (أكثر من محاولة)",
  noRepeated: "لا تكرار ✓",

  // تقرير المشرف
  circleName: "الحلقة",
  sessions: "الجلسات",
  linkToCircle: "التفاصيل",
  totalRow: "الإجمالي",

  // تقرير الإدارة
  attendanceRate: "نسبة الحضور",
  totalStudents: "الطلاب المقيّدون",
  totalSessions: "الجلسات",

  // تقرير الطالب
  myAttendance: "حضوري اليوم",
  mySession: "جلستي",
  myPoints: "نقاطي اليوم",
  pointsUnit: "نقطة",

  // تقرير مُدّكِر
  muddakirTitle: "حفّاظي اليوم",
  muddakirCompleted: "أتمّوا",
  newPagesCol: "الصفحات الجديدة",
  ribatCol: "الرباط",
  reviewCol: "المراجعة",
  dayStatusDone: "✓",
  dayStatusOpen: "جارٍ",
  dayStatusUnknown: "—",
} as const;

export type ReportKey = keyof typeof reportAr;
export function tR(key: ReportKey): string { return reportAr[key]; }
