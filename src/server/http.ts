import { AuthenticationError, AuthorizationError, ValidationError } from "./errors";
import { errorsAr } from "@/i18n/ar/errors";

// تحويل أخطاء المجال إلى استجابات HTTP متّسقة.
//   AuthenticationError ⟵ 401 (لا مصادقة صالحة)
//   AuthorizationError  ⟵ 403 (تجاوز قاعدة تحكّم)
//   ValidationError     ⟵ 400 (إدخال/قاعدة عمل)
//   غير ذلك             ⟵ 500 (بلا تفاصيل)
//
// التوطين (PR-1e): يُصدَّر مفتاح الخطأ (key) بجانب النصّ العربيّ متى حمله الخطأ، فتُطابقه
// الواجهة بالمفتاح لا بالنصّ (النصّ يُترجَم لاحقاً). النصّ يبقى احتياطاً.
export function errorResponse(e: unknown): Response {
  if (e instanceof AuthenticationError) {
    return Response.json({ error: e.message, key: e.key }, { status: 401 });
  }
  if (e instanceof AuthorizationError) {
    return Response.json({ error: e.message, key: e.key }, { status: 403 });
  }
  if (e instanceof ValidationError) {
    return Response.json({ error: e.message, key: e.key }, { status: 400 });
  }
  // خطأ غير متوقّع (500): يُسجَّل في السجل ليظهر في Vercel Logs — لتشخيص السبب.
  // رسائل أخطاء Prisma تُخفي بيانات الاعتماد، فلا يتسرّب سرّ. الرد للعميل عامّ.
  console.error(
    "[500] unhandled route error:",
    e instanceof Error ? `${e.name}: ${e.message}` : String(e),
  );
  return Response.json({ error: errorsAr.internal, key: "internal" }, { status: 500 });
}
