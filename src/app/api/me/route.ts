import { getMyPage } from "@/server/me";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { makeTimer } from "@/lib/timing";

// GET /api/me — صفحة المستخدم عن نفسه. أيّ مُصادَق فعّال. بلا رقم هوية.
// أثناء الانتحال: الاسم/الأدوار = المنتحَل (الهويّة الفعليّة)، مع علامة impersonating للشريط.
export async function GET(req: Request) {
  const t = makeTimer();
  try {
    const actor = await requireAuth(req);
    t.endAuth();
    const page = await getMyPage(actor.id);
    t.endDb();
    t.log("/api/me");
    return new Response(JSON.stringify({ ...page, impersonating: actor.impersonating }), {
      headers: { "Content-Type": "application/json", "Server-Timing": t.header() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
