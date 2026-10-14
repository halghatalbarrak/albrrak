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
} as const;

/** مفاتيح أخطاء الخادم المُرحَّلة (تنمو كلّما رُحِّل مجال). */
export type ErrorKey = keyof typeof errorsAr;

/** النصّ العربيّ لمفتاح خطأٍ (للرمي والعرض الاحتياطيّ). */
export function tErr(key: ErrorKey): string {
  return errorsAr[key];
}
