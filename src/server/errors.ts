// أخطاء المجال — تُرمى من الخادم عند رفض قاعدة مطلقة أو تحقّق.
// وجودها كأصناف يجعل الاختبار يتأكّد من *نوع* الرفض لا مجرّد وقوعه.
//
// التوطين (PR-1e): كلّ خطأٍ يحمل مفتاحاً اختياريّاً (key) يُصدَّر في الاستجابة بجانب النصّ
// العربيّ، فتُطابقه الواجهة بالمفتاح لا بالنصّ (النصّ يُترجَم لاحقاً). النصّ العربيّ يبقى
// حرفاً بحرف احتياطاً حتى يكتمل النقل. المصدر الموحّد للنصوص المفتاحيّة: src/i18n/ar/errors.ts.

/** غياب مصادقة صالحة — لا JWT أو غير متحقَّق (⟵ 401). */
export class AuthenticationError extends Error {
  constructor(message: string, readonly key?: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** رفض صلاحية — تجاوزٌ لقاعدة تحكّم (م١/م٣/م٥/التفويض) (⟵ 403). */
export class AuthorizationError extends Error {
  constructor(message: string, readonly key?: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** إدخال غير صالح أو قاعدة عمل لم تُستوفَ (مثل: رفض اعتماد بلا سبب). */
export class ValidationError extends Error {
  constructor(message: string, readonly key?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ─────────── مُنشِئات الأخطاء المفتاحيّة (PR-1e) ───────────
// تبني الخطأ بنصّه العربيّ (من القاموس) ومفتاحه معاً، فيكفي ذكر المفتاح في موضع الرمي:
// `throw verr("invalidDate")`. النصّ يبقى حرفاً بحرف، والمفتاح يُصدَّر للواجهة.
import { errorsAr, type ErrorKey } from "@/i18n/ar/errors";

export const verr = (key: ErrorKey): ValidationError => new ValidationError(errorsAr[key], key);
export const aerr = (key: ErrorKey): AuthorizationError => new AuthorizationError(errorsAr[key], key);
export const authErr = (key: ErrorKey): AuthenticationError => new AuthenticationError(errorsAr[key], key);
