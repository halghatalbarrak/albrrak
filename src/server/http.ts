import { AuthorizationError, ValidationError } from "./errors";

// تحويل أخطاء المجال إلى استجابات HTTP متّسقة.
//   AuthorizationError ⟵ 403 (تجاوز قاعدة تحكّم)
//   ValidationError    ⟵ 400 (إدخال/قاعدة عمل)
//   غير ذلك            ⟵ 500 (بلا تفاصيل)
export function errorResponse(e: unknown): Response {
  if (e instanceof AuthorizationError) {
    return Response.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof ValidationError) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  return Response.json({ error: "خطأ داخلي" }, { status: 500 });
}
