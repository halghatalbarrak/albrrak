// قاموس نصوص المُدَّكِر (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في البرنامج.
// يُستدعى بمفتاحٍ عبر tMuddakir، تمهيداً لإضافة الإنجليزيّة والروسيّة لاحقاً (قواميس موازية
// بالمفاتيح نفسها). المصطلحات مُلزَمةٌ بـ§٠٫٥: الحافظ/المشرف/المختبِر/المدير — لا «طالب» ولا «عريف».
// لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.

import { arNum } from "@/lib/format";

export const muddakirAr = {
  // اسم البرنامج والأدوار (§٢)
  programName: "المُدَّكِر",
  roleHafiz: "الحافظ",
  roleSupervisor: "المشرف",
  roleExaminer: "المختبِر",
  roleManager: "المدير",

  // المرحلة (§١)
  stage: "المرحلة",
  stageExamPass: "اجتياز",
  stageExamFail: "عدم اجتياز",
  graduation: "التخرّج",

  // أركان اليوم بترتيبها في الشاشة (§٣)
  pillarYesterday: "تكرار الأمس",
  pillarNew: "الجديد",
  pillarRibat: "الربط",
  pillarReview: "المراجعة",
  pillarErrors: "علاج الأخطاء",
  pillarComplete: "الإتمام",

  // حالات الوجه (§٤٫٢)
  faceNew: "جديد",
  faceInRibat: "في الربط",
  faceHeard: "مسموع",
  faceInReview: "في المراجعة",
  faceWeak: "ضعيف",

  // حالات اليوم (§٥)
  dayOpen: "مفتوح",
  dayComplete: "مُتمّ",
  dayPendingMakeup: "بانتظار القضاء",
  dayMadeUp: "مقضيّ",
  dayShortfall: "تقصير",
  dayExcused: "معذور",

  // أسباب العذر (§٥)
  excuseIllness: "مرض",
  excuseTravel: "سفر",
  excuseExams: "اختبارات",

  // مصادر الخطأ (§٤٫٤)
  errorSourceRibat: "الربط",
  errorSourceReview: "المراجعة",
  errorSourceSupervisor: "المشرف",

  // اللقاء الأسبوعيّ ونمط اللقاء (§٦)
  meeting: "اللقاء الأسبوعيّ",
  deliveryInPerson: "حضوريّ",
  deliveryRemote: "عن بُعد",

  // شاشة الإدارة (المرحلة ٣)
  adminTitle: "إدارة المُدَّكِر",
  colHafiz: "الحافظ",
  colStage: "المرحلة",
  colSupervisor: "المشرف",
  colDelivery: "نمط اللقاء",
  enroll: "إلحاق",
  enrollHafiz: "إلحاق حافظ",
  assign: "إسناد",
  reassign: "إعادة إسناد",
  selectHafiz: "اختر حافظًا",
  selectSupervisor: "اختر مشرفًا",
  noSupervisor: "بلا مشرف",
  supervisorFull: "ممتلئ",
  myHafiz: "حفّاظي",
  readOnlyView: "عرضٌ للقراءة فقط",
  noHafizYet: "لا حفّاظ بعد.",
  noSupervisors: "لا مشرفون متاحون.",
  noEnrollable: "لا حفّاظ متاحون للإلحاق.",
  loadWord: "من", // لِـ«٢ من ٤»
} as const;

/** مفاتيح قاموس المُدَّكِر (للتحقّق الثابت عند الاستدعاء). */
export type MuddakirKey = keyof typeof muddakirAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس المُدَّكِر. */
export function tMuddakir(key: MuddakirKey): string {
  return muddakirAr[key];
}

/** تسمية مرحلةٍ بالأرقام الهنديّة: stageLabel(1) → «المرحلة ١». */
export function stageLabel(stage: number): string {
  return `${tMuddakir("stage")} ${arNum(stage)}`;
}

/** حِمل المشرف بالأرقام الهنديّة: supervisorLoadLabel(2, 4) → «٢ من ٤». */
export function supervisorLoadLabel(load: number, max: number): string {
  return `${arNum(load)} ${tMuddakir("loadWord")} ${arNum(max)}`;
}
