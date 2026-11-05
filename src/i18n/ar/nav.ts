// نصوص القائمة الجانبيّة والتبويبات (العربيّة). المصدر الوحيد لعناوين المجموعات والمداخل،
// فيُستدعى في nav.ts (دالّة نقيّة) وفي أشرطة التبويبات. لا منطق هنا — نصوصٌ فقط.

export const navAr = {
  // ── عناوين المجموعات ──
  grpHome: "الرئيسية",
  grpOperate: "التشغيل اليوميّ",
  grpCircles: "الحلقات والحضور",
  grpStudents: "الطلاب والقيد",
  grpAssess: "التقييم والاختبارات",
  grpMotivate: "التحفيز",
  grpPrograms: "المناهج",
  grpMuddakir: "المُدَّكِر",
  grpMuddakirAdmin: "إدارة المُدَّكِر",
  grpMuddakirExam: "سرد المُدَّكِر",
  grpSettings: "الإعدادات",
  grpMarket: "البيدر",
  grpLearn: "التعلّم",
  grpMessages: "الرسائل",

  // ── مداخل ──
  home: "الرئيسية",
  unified: "الشاشة الموحّدة",
  session: "الجلسة اليوميّة",
  grantPoints: "منح النقاط",
  circles: "الحلقات",
  circlesMine: "حلقتي",
  attendance: "الحضور",
  arifs: "العرفاء",
  students: "الطلاب",
  applications: "الطلبات",
  studentsImport: "استيراد الطلاب",
  hasad: "الحصاد",
  stageExam: "اختبار المرحلة",
  economy: "النقاط",
  market: "البيدر",
  gamification: "التلعيب",
  display: "الشاشة التحفيزيّة",
  civilBase: "القاعدة المدنية",
  maraqi: "مراقي",
  weekly: "الأسبوعيّ",
  muddakirProgram: "البرنامج",
  muddakirRequests: "الطلبات",
  muddakirMyRequests: "طلباتي",
  muddakirStaff: "الطاقم",
  muddakirTathbit: "إعدادات التثبيت",
  muddakirMeeting: "لقاء المُدَّكِر",
  muddakirRecitation: "سرد المُدَّكِر",
  muddakirHifazi: "حفّاظي",
  muddakirWeekly: "اللقاء الأسبوعيّ",
  lists: "القوائم",
  users: "المستخدمون",
  sell: "الجَنْي",
  myPage: "صفحتي",
  myJourney: "رحلتي",
  messages: "الرسائل",

  // ── عناوين التبويبات (شريط فوق المسارات المتقاربة) ──
  tabApplications: "الطلبات",
  tabApprovals: "الاعتمادات",
  tabEnrollment: "القيد",
  tabAttendanceDaily: "الحضور",
  tabAttendanceLock: "قفل الحضور",
  tabMuddakirProgram: "البرنامج",
  tabMuddakirRequests: "الطلبات",
  tabMuddakirStaff: "الطاقم",
} as const;

export type NavKey = keyof typeof navAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس القائمة. */
export function tNav(key: NavKey): string {
  return navAr[key];
}
