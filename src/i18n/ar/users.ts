// قاموس نصوص إدارة المستخدمين (العربيّة) — النصوص المكتوبة مباشرةً في صفحتَي
// src/app/admin/users/page.tsx و src/app/admin/users/new/page.tsx.
// يُستدعى بمفتاحٍ عبر tUsers، تمهيداً لإضافة لغاتٍ أخرى لاحقاً (قواميس موازية بالمفاتيح نفسها).
// النصوص الآتية من "./shared" (ROLE_AR وMUDDAKIR_*) لا تُنقل هنا — لها قاموسها القائم.

export const usersAr = {
  // رسائل الخطأ/النجاح (page.tsx)
  errNoPermission: "لا صلاحية — إدارة المستخدمين للمشرف العام والمدير التقنيّ فقط.",
  errLoad: "تعذّر جلب المستخدمين.",
  errImpersonate: "تعذّر بدء الانتحال.",
  errToggleActive: "تعذّر تغيير الحالة.",
  errReset: "تعذّرت إعادة التعيين.",
  errSaveRoles: "تعذّر حفظ الأدوار.",
  resetLinkTitlePrefix: "رابط إعادة تعيين كلمة سرّ: ", // يليه اسم المستخدم
  saveRolesPartialPrefix: "حُفظت الأدوار العامّة، وتعذّر حفظ أدوار المدّكر: ", // يليه الخطأ

  // أعمدة الجدول (page.tsx)
  colName: "الاسم",
  colPhone: "الجوال",
  colRoles: "الأدوار",
  colState: "الحالة",
  colAction: "إجراء",
  badgeStudent: "طالب",
  stateActive: "مُفعّل",
  stateDisabled: "معطَّل",

  // أزرار الصفّ (page.tsx)
  btnImpersonate: "انتحال",
  btnRoles: "الأدوار",
  btnReset: "إعادة تعيين",
  btnDisable: "تعطيل",
  btnEnable: "تفعيل",

  // AppShell والعنوان (page.tsx)
  shellTitle: "المستخدمون",
  crumbHome: "الرئيسة",
  crumbUsers: "المستخدمون",

  // حالات التحميل والفراغ والوصف (page.tsx)
  loading: "جارٍ التحميل…",
  intro: "إضافة كادرٍ · تعطيل/تفعيل (لا حذف) · تعديل الأدوار · إعادة تعيين كلمة السرّ.",
  btnNew: "+ جديد",
  btnCloseLink: "إغلاق",
  tableEmpty: "لا مستخدمين.",

  // نافذة تعديل الأدوار (page.tsx)
  rolesModalTitlePrefix: "أدوار: ", // يليه اسم المستخدم
  btnSave: "حفظ",
  btnCancel: "إلغاء",
  adminActorNote: "إجراؤك يُرسَل للاعتماد.",

  // صفحة إضافة كادر (new/page.tsx)
  errCreate: "تعذّر إنشاء الكادر.",
  createRolesPartialPrefix: "أُنشئ الحساب، وتعذّر تعيين أدوار المدّكر: ", // يليه الخطأ
  newShellTitle: "إضافة كادر",
  crumbUsersNav: "المستخدمون",
  crumbNewStaff: "كادر جديد",
  createdTitle: "أُنشئ الكادر ✓ — أرسِل له رابط التفعيل في واتساب",
  createdHint: "انسخ الرابط الآن؛ لن يظهر مرّةً أخرى.",
  btnBackToList: "رجوع للقائمة",
  fieldName: "الاسم",
  placeholderName: "اسم الكادر",
  fieldPhone: "الجوال",
  placeholderPhone: "9665… أو 05…",
  fieldRoles: "الأدوار",
  btnSaving: "جارٍ…",
  btnCreate: "إنشاء",
} as const;

/** مفاتيح قاموس إدارة المستخدمين (للتحقّق الثابت عند الاستدعاء). */
export type UsersKey = keyof typeof usersAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس إدارة المستخدمين. */
export function tUsers(key: UsersKey): string {
  return usersAr[key];
}
