// قاموس رسائل أخطاء الخادم (العربيّة) — المصدر الموحّد المفتاحيّ (التوطين، PR-1e).
// يُرمى الخطأ بمفتاحٍ ثابتٍ ونصٍّ عربيٍّ حرفيّ؛ تُصدَّر الاستجابة { error, key } فتُطابقه
// الواجهة بالمفتاح لا بالنصّ. يُملأ القاموس تدريجيّاً كلّما رُحِّل مجالٌ (الحضور أولاً).
// النصوص هنا منقولةٌ حرفاً بحرف من مواضع throw القديمة — بلا تغيّرٍ ظاهر.
//
// (الرسائل ذات التضمين ${…} تبقى مركَّبةً في موضع الرمي، وتحمل مفتاحاً بلا مدخلٍ هنا.)

export const errorsAr = {
  // عامّ
  internal: "خطأ داخلي",

  // المصادقة (AuthenticationError — auth.ts)
  noSupabaseJwks: "لا عنوان Supabase للتحقّق غير المتماثل (JWKS).",
  hs256NeedsSecret: "HS256 يحتاج SUPABASE_JWT_SECRET.",
  tokenNoSubject: "رمز بلا هوية.",
  invalidAuthToken: "رمز مصادقة غير صالح.",
  noAuthToken: "لا رمز مصادقة.",
  accountMissingOrDisabled: "حساب غير موجود أو معطَّل.",
  notAuthorized: "غير مخوّل.",

  // الحضور وقفل اليوم (attendance.ts · attendance-lock.ts)
  lockGraceNonNegative: "مهلة القفل عددٌ صحيحٌ ≥ ٠.",
  unlockRequestReasonRequired: "سبب طلب الفتح مطلوب.",
  dayNotLocked: "اليوم غير مقفل — لا حاجة لطلب فتح.",
  unlockRequestPending: "لهذا اليوم طلب فتحٍ معلّقٌ بالفعل.",
  unlockRequestNotFound: "طلب فتحٍ غير موجود.",
  unlockReasonRequired: "سبب الفتح مطلوب.",
  attendanceListForAdmin: "هذه القائمة للإدارة.",
  invalidDate: "تاريخ غير صالح.",
  attendanceUserNotFound: "مستخدم غير موجود.",
  onlyYourCircles: "لا تَرصد إلا حلقاتك (§٣٫٢).",
  studentNotFound: "طالب غير موجود.",
  excuseByStudentOrGuardian: "الاستئذان يقدّمه الطالب أو وليّه فقط (§١٠٫٢).",
  noStudentsInCircle: "لا طلاب منتسبين لهذه الحلقة.",
  markStudentNotInCircle: "رصدُ طالبٍ ليس من الحلقة.",
  unknownAttendanceStatus: "حالة حضورٍ غير معروفة.",
  studentNotInThisCircle: "الطالب ليس من هذه الحلقة.",
  excuseReasonRequired: "سبب العذر مطلوب.",
  preExcuseFutureOnly: "الاستئذان المسبق لتاريخٍ لم يأتِ بعد (§١٠٫٢).",
  dayRequestPending: "لهذا اليوم طلبٌ معلّقٌ بالفعل.",
  excuseRequestNotFound: "طلب عذرٍ غير موجود.",
  excusePayloadCorrupt: "حمولة طلب العذر تالفة.",

  // الأدوار والصلاحيّات (user-management.ts · impersonation.ts · authz.ts · account*.ts · *-eligibility.ts · national-id.ts)
  userNotFound: "مستخدم غير موجود.",
  userAdminRolesOnly: "إدارة المستخدمين للمشرف العام والمدير التقنيّ فقط (ROLES.md).",
  staffNameRequired: "اسم الكادر مطلوب.",
  atLeastOneRole: "لا بدّ من دورٍ واحدٍ على الأقلّ.",
  unknownRole: "دورٌ غير معروف.",
  noRoleAboveYours: "لا تمنح دوراً أعلى من دورك.",
  phoneTakenByAnother: "هذا الجوال مسجّل لمستخدم آخر.",
  noDeactivateSelf: "لا تعطّل حسابك.",
  noDeactivateLastTechAdmin: "لا يُعطَّل آخر مدير تقنيّ فعّال.",
  noEditOwnRoles: "لا تعدّل أدوار حسابك.",
  atLeastOneRoleOrStaff: "لا بدّ من دورٍ واحدٍ على الأقلّ (دورٌ عامٌّ أو وظيفة مدّكر).",
  noRemoveLastTechAdmin: "لا يُنزع آخر مدير تقنيّ فعّال.",
  userNoLoginNoPassword: "المستخدم بلا حساب دخول — لا كلمة سرّ.",
  invalidActivationLink: "رابط تفعيلٍ غير صالح.",
  activationLinkUsed: "هذا الرابط استُعمِل من قبل.",
  activationLinkExpired: "انتهت صلاحيّة هذا الرابط.",
  passwordMinEight: "كلمة السرّ ثمانية أحرفٍ فأكثر.",
  userNoLogin: "المستخدم بلا حساب دخول.",
  impersonationNotConfigured: "الانتحال غير مُهيّأ (IMPERSONATION_SECRET مفقود).",
  noImpersonateWhileImpersonating: "لا يمكن بدء انتحالٍ أثناء انتحال (يُفحَص الفاعل الحقيقيّ).",
  impersonationTechAdminOnly: "الانتحال للمدير التقنيّ وحده.",
  noImpersonateSelf: "لا تنتحل نفسك.",
  userMissingOrDisabled: "المستخدم غير موجودٍ أو معطَّل.",
  noImpersonateTechAdmin: "لا يُنتحَل مديرٌ تقنيّ.",
  phoneInvalidForAccount: "رقم جوال غير صالح لإنشاء الحساب.",
  noLoginUnderThirteen: "م٤: لا يُنشأ حساب دخول لمن دون الثالثة عشرة.",
  accountNeedsPhone: "إنشاء الحساب يحتاج رقم جوال.",
  noBirthDateForAge: "لا تاريخ ميلاد — يتعذّر التحقّق من العمر.",
  notYetThirteen: "لم يبلغ الثالثة عشرة بعد.",
  reciterNotAllowedForStudent: "لا يجوز إسناد هذا المُسمِّع لهذا الطالب (م١/م٣).",
  teacherCannotExamineOwnStudent: "لا يجوز أن يختبر المعلمُ طالبَه (م١).",
  nationalIdViewNotAuthorized: "غير مخوّل بالاطّلاع على رقم الهوية (م٥).",
  noNationalIdForUser: "لا يوجد رقم هوية لهذا المستخدم.",
  applicationNotFound: "طلب غير موجود.",

  // الإنشاء/القيد/التسكين (application.ts · enrollment.ts · civil-base.ts · circles.ts · guardian.ts · students.ts · placement.ts · placement-actions.ts)
  acceptPendingOrWaitlistedOnly: "لا يُقبل إلا طلبٌ معلّق أو في قائمة الانتظار.",
  studentThirteenNeedsPhone: "طالب ١٣+ يحتاج رقم جواله لإنشاء الحساب.",
  applicationAlreadyDecided: "الطلب حُسم من قبل.",
  rejectRequiresNote: "الرفض يستلزم سببًا مكتوبًا.",
  circleNotFound: "حلقة غير موجودة.",
  studentAlreadyInThisCircle: "الطالب مُسنَدٌ إلى هذه الحلقة فعلًا.",
  stageNotFound: "مرحلة غير موجودة.",
  stageKindUnexpected: "نوع المرحلة غير متوقّع.",
  approvalPayloadMissing: "حمولة الاعتماد ناقصة.",
  circleNameRequired: "اسم الحلقة مطلوب.",
  programNotFound: "البرنامج غير موجود.",
  unlinkRequestRequiresNote: "طلب فكّ الربط يستلزم سببًا مكتوبًا من الطالب.",
  examinerNotesRequired: "ملاحظات المختبر مطلوبة (§٦٫٣).",
  readingTestOnlyForAwaiting: "اختبار القراءة لا يُسجَّل إلا لطالبٍ بانتظاره.",
  placementDecisionPending: "لهذا الطالب قرار تحديدٍ معلّقٌ بالفعل.",
  qaidahTrackNeedsCircle: "مسار القاعدة المدنية يحتاج حلقةً.",
  theCircleNotFound: "الحلقة غير موجودة.",
  qaidahCircleOnlyForNonFluent: "حلقة القاعدة المدنية فقط لمن لا يجيد النظر.",
  rejectRequiresNoteSection34: "الرفض يستلزم سببًا مكتوبًا (§٣٫٤).",
  placementDecisionNotFound: "قرار تحديدٍ غير موجود.",
  decisionAlreadyMade: "القرار حُسم من قبل — لا يُحسم مرتين.",
  studentStateChangedPlacement: "حالة الطالب تغيّرت — تعذّر تنفيذ التحديد.",
  decisionPayloadCorrupt: "بيان القرار تالفٌ — تعذّر التنفيذ.",
  qaidahDecisionNoCircle: "قرار القاعدة المدنية بلا حلقة — تعذّر الإسناد.",
  decisionCircleNotFound: "حلقة القرار غير موجودة.",
  placeChangeProgramAuthorized: "التسكين وتغيير البرنامج للمشرف/مدير الحلقة/المدير التقنيّ (ق٧).",
  qaidahPlacementForQaidahStudents: "تسكين القاعدة لطلاب القاعدة المدنية.",
  qaidahProgramNotSeeded: "برنامج القاعدة غير مبذور.",
  lessonNotInQaidah: "الدرس غير موجودٍ في القاعدة.",
  maraqiPlacementForMaraqiStudents: "تسكين مراقي لطلاب مراقي.",
  programNotSeeded: "البرنامج غير مبذور.",
  programNotFoundGeneric: "برنامج غير موجود.",
  noActiveEnrollmentForStudent: "لا قيدٌ نشطٌ للطالب.",
} as const;

/** مفاتيح أخطاء الخادم المُرحَّلة (تنمو كلّما رُحِّل مجال). */
export type ErrorKey = keyof typeof errorsAr;

/** النصّ العربيّ لمفتاح خطأٍ (للرمي والعرض الاحتياطيّ). */
export function tErr(key: ErrorKey): string {
  return errorsAr[key];
}
