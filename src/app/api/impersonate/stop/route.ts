import { requireAuth } from "@/server/auth";
import { stopImpersonation, buildClearCookie } from "@/server/impersonation";
import { errorResponse } from "@/server/http";

// POST /api/impersonate/stop — ينهي الانتحال ويعيد المدير التقنيّ لحسابه. أيّ مُصادَق
// (المسح idempotent). يمسح الكوكي فورًا — بلا تسجيل دخول/خروج.
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    await stopImpersonation(actor);
    return Response.json({ ok: true }, { status: 200, headers: { "set-cookie": buildClearCookie() } });
  } catch (e) {
    return errorResponse(e);
  }
}
