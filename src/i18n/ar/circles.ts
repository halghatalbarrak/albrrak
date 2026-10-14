// قاموس نصوص شاشات الحلقات (الإدارة) — العربيّة. المصدر الوحيد لكل نصٍّ يظهر للمستخدم
// في صفحات admin/circles. يُستدعى بمفتاحٍ عبر tCircles، تمهيداً لإضافة لغاتٍ موازيةٍ لاحقاً
// بالمفاتيح نفسها. لا تُكتب الأرقام هنا؛ العرض الرقميّ بـarNum في طبقة العرض.
// الأجزاء المتغيّرة (الأعداد، أسماء البرامج/الحلقات، أرقام السور/الآيات) تُركَّب في الصفحة.

export const circlesAr = {
  // مسارات التنقّل (crumbs) — مشتركةٌ بين الصفحات
  crumbHome: "الرئيسة",
  crumbAdmin: "الإدارة",
  crumbCircles: "الحلقات",
  crumbNew: "جديدة",
  crumbMap: "الخريطة",

  // رسائل الخطأ/الصلاحية
  errForbidden: "لا صلاحية — هذه الشاشة للمدير.",
  errLoadCircles: "تعذّر جلب الحلقات.",
  errChangeProgram: "تعذّر تغيير البرنامج الافتراضيّ.",
  errLoadPrograms: "تعذّر جلب البرامج.",
  errCreateCircle: "تعذّر إنشاء الحلقة.",
  errForbiddenMap: "لا صلاحية — لا تَرى إلا خريطة حلقتك.",
  errLoadMap: "تعذّر جلب الخريطة.",

  // شاشة قائمة الحلقات
  listTitle: "الحلقات",
  colName: "الاسم",
  colDefaultProgram: "البرنامج الافتراضيّ",
  colSlot: "الوقت",
  colGender: "الجنس",
  colLocation: "المكان",
  colMap: "الخريطة",
  weaknessMapLink: "خريطة الضعف",
  newBtn: "+ جديد",
  emptyTitle: "لا حلقات بعد",
  emptyDescription: "أنشئ الأولى بزرّ «+ جديد».",

  // أوقات الصلاة (تسميات عرضٍ لرموز الخادم)
  slotAsr: "العصر",
  slotMaghrib: "المغرب",

  // الجنس (تسميات عرض)
  genderMale: "بنون",
  genderFemale: "بنات",

  // شاشة إضافة حلقة
  newTitle: "حلقة جديدة",
  fieldName: "الاسم",
  fieldProgram: "البرنامج",
  fieldSlot: "الوقت",
  fieldGender: "الجنس",
  fieldLocation: "المكان (اختياري)",
  selectPlaceholder: "اختر…",
  savingBtn: "جارٍ…",
  createBtn: "إنشاء",
  cancelBtn: "إلغاء",

  // شاشة خريطة الضعف
  mapTitle: "خريطة ضعف الحلقة",
  studentSingular: "طالب",
  studentDual: "طالبان",
  studentPlural: "طلاب",
  mapEmptyTitle: "لا مواضع تعثّرٍ جماعيّ بعد",
  mapEmptyDescription: "تظهر الخريطة حين يتعثّر طلابٌ في آياتٍ بعينها خلال الحصاد.",
  mapHintLine1: "آيةٌ يتعثّر فيها عدّةٌ من طلابك = خللٌ في التلقين لا في الطلاب — علّمها الحلقةَ جماعةً.",
  mapHintLine2: "كلّما اشتدّ البرونزيّ كثُر المتعثّرون فيها.",
  mostStumbled: "أكثر المواضع تعثّرًا",
  surahWord: "سورة",
  ayahWord: "آية",
  stumbledIn: "تعثّر فيها",
  facesHeading: "الأوجه",
  faceOfPage: "وجه ص",
  positionWord: "موضعًا",
} as const;

/** مفاتيح قاموس شاشات الحلقات (للتحقّق الثابت عند الاستدعاء). */
export type CirclesKey = keyof typeof circlesAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس شاشات الحلقات. */
export function tCircles(key: CirclesKey): string {
  return circlesAr[key];
}
