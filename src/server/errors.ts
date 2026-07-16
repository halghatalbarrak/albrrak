// أخطاء المجال — تُرمى من الخادم عند رفض قاعدة مطلقة أو تحقّق.
// وجودها كأصناف يجعل الاختبار يتأكّد من *نوع* الرفض لا مجرّد وقوعه.

/** غياب مصادقة صالحة — لا JWT أو غير متحقَّق (⟵ 401). */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** رفض صلاحية — تجاوزٌ لقاعدة تحكّم (م١/م٣/م٥/التفويض) (⟵ 403). */
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
