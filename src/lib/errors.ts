// أخطاء المجال — تُرمى من الخادم عند رفض قاعدة مطلقة أو تحقّق.
// وجودها كأصناف يجعل الاختبار يتأكّد من *نوع* الرفض لا مجرّد وقوعه.

/** رفض صلاحية — تجاوزٌ لقاعدة تحكّم (م١/م٣/م٥/التفويض). */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** إدخال غير صالح أو قاعدة عمل لم تُستوفَ (مثل: رفض اعتماد بلا سبب). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
