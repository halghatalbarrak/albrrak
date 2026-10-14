import { setMyLocale } from "@/server/me";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// PATCH /api/me/locale — يحفظ لغة واجهة المستخدم في حسابه (التوطين، PR-1). الجسم: { locale }.
export async function PATCH(req: Request) {
  try {
    const actor = await requireAuth(req);
    const b = (await req.json()) as { locale?: unknown };
    if (typeof b.locale !== "string") throw new ValidationError("اللغة مطلوبة.");
    await setMyLocale(actor.id, b.locale);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
