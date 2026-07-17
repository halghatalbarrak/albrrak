import { AuthenticationError, AuthorizationError, ValidationError } from "./errors";

// تحويل أخطاء المجال إلى استجابات HTTP متّسقة.
//   AuthenticationError ⟵ 401 (لا مصادقة صالحة)
//   AuthorizationError  ⟵ 403 (تجاوز قاعدة تحكّم)
//   ValidationError     ⟵ 400 (إدخال/قاعدة عمل)
//   غير ذلك             ⟵ 500 (بلا تفاصيل)
export function errorResponse(e: unknown): Response {
  if (e instanceof AuthenticationError) {
    return Response.json({ error: e.message }, { status: 401 });
  }
  if (e instanceof AuthorizationError) {
    return Response.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof ValidationError) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  // خطأ غير متوقّع (500): يُسجَّل في السجل ليظهر في Vercel Logs — لتشخيص السبب.
  // رسائل أخطاء Prisma تُخفي بيانات الاعتماد، فلا يتسرّب سرّ. الرد للعميل عامّ.
  console.error(
    "[500] unhandled route error:",
    e instanceof Error ? `${e.name}: ${e.message}` : String(e),
  );
  return Response.json({ error: "خطأ داخلي" }, { status: 500 });
}
