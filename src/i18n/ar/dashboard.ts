// قاموس لوحة عمل المدير (العربيّة)
// src/app/admin/analytics/page.tsx

export const dashboardAr = {
  // ── الصفحة ──────────────────────────────────────────────────────────────
  pageTitle: "لوحة العمل",
  pageSubtitle: "نظرةٌ شاملةٌ على الحلقات — يتجدّد عند كلّ تحميل",
  loading: "جارٍ تحميل البيانات…",
  errLoad: "تعذّر تحميل لوحة العمل.",
  donorNote: "البيانات مجمّعة — لا أسماء لحفظ الخصوصيّة.",

  // ── القسم ١: يحتاجون متابعة ─────────────────────────────────────────────
  s1Title: "يحتاجون متابعة اليوم",
  s1Empty: "لا طلاب يحتاجون متابعةً الآن.",
  colName: "الاسم",
  colCircle: "الحلقة",
  colTeacher: "المعلّم",
  colReasons: "السبب",
  btnOpen: "فتح",
  reasonAbsent: "غياب متتالٍ",
  reasonRepeated: "مقطع متكرّر",
  reasonNoProgress: "لا تقدّم ٧ أيام",
  reasonNoGuardian: "بلا وليّ أمر",
  reasonNoTrack: "بلا مسار",
  reasonPaceTest: "ينتظر اختبار المستوى",
  reasonMuddakirShortfall: "نقص في أيّام المدّكر",
  reasonMuddakirUnconfirmed: "أسبوع مدّكر غير مؤكَّد",

  // ── القسم ٢: اليوم في الحلقات ───────────────────────────────────────────
  s2Title: "اليوم في الحلقات",
  s2Empty: "لا حلقات مسجّلة.",
  cardPresent: "حاضر",
  cardTotal: "الإجمالي",
  cardRecited: "سُمِّع له",
  cardNotRecited: "لم يُسمَّع بعد",
  cardNotOpened: "لم يُفتح اليوم بعد",
  btnCircle: "الحلقة",

  // ── القسم ٣: طلاب الحلقات ───────────────────────────────────────────────
  s3Title: "طلاب الحلقات",
  s3Empty: "لا طلاب نشطون.",
  searchPlaceholder: "ابحث بالاسم…",
  filterCircle: "الحلقة",
  filterAll: "الكل",
  colPos: "الموضع",
  colStage: "المرحلة",
  colMonthlyHifz: "حفظ الشهر",
  colTransition: "معدّل الانتقال",
  colAttPct: "الحضور",
  colMasteryPct: "الإتقان",
  colKhatm: "يختم في",
  unitLines: "سطر",
  unitFaces: "وجه",
  noPosition: "—",
  noStage: "—",
  noKhatm: "—",
  transitionAbove: "↑ فوق المتوسّط",
  transitionBelow: "↓ دون المتوسّط",
  transitionAvg: "متوسّط",

  // ── القسم ٤: مقارنة الحلقات ─────────────────────────────────────────────
  s4Title: "مقارنة الحلقات",
  s4Empty: "لا حلقات للمقارنة.",
  colCircleName: "الحلقة",
  colStudents: "الطلاب",
  colAttendance: "الحضور",
  colHifz: "الحفظ الشهريّ",
  colAvgTransition: "معدّل الانتقال",
  colMastery: "الإتقان",
  colStruggling: "متعثّرون",

  // ── الرسوم ──────────────────────────────────────────────────────────────
  s5Title: "الرسوم البيانيّة",
  chartAttTitle: "الحضور",
  chartHifzTitle: "الجلسات المُتقَنة",
  chartPresent: "حاضر",
  chartTotal: "الإجمالي",
  chartMastered: "مُتقَن",
  noChartData: "لا بيانات بعد.",

  // ── قسم المدّكِر ─────────────────────────────────────────────────────────
  muddTitle: "مُدَّكِر — يحتاجون متابعة",
  muddEmpty: "لا حفّاظ يحتاجون متابعةً الآن.",
  colHafiz: "الحافظ",
  colSupervisor: "المشرف",
  colMuddReasons: "السبب",

  // ── طباعة ────────────────────────────────────────────────────────────────
  btnPrint: "طباعة / PDF",
} as const;

export type DashboardKey = keyof typeof dashboardAr;
export function tD(key: DashboardKey): string { return dashboardAr[key]; }
