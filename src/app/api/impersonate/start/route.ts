import { requireAuth } from "@/server/auth";
import { startImpersonation, signImpersonation, buildSetCookie } from "@/server/impersonation";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/impersonate/start — يبدأ انتحال الشخصيّة. TECH_ADMIN وحده (الحُرّاس في الخادم).
// الجسم: { targetUserId }. لا يبدّل جلسة Supabase؛ يضع كوكي httpOnly موقّعة فوقها.
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const b = (await req.json()) as { targetUserId?: unknown };
    if (typeof b.targetUserId !== "string" || !b.targetUserId) {
      throw new ValidationError("الهدف مطلوب.");
    }
    const payload = await startImpersonation(actor, b.targetUserId);
    return Response.json({ ok: true }, { status: 200, headers: { "set-cookie": buildSetCookie(signImpersonation(payload)) } });
  } catch (e) {
    return errorResponse(e);
  }
}
