import { getMyQaidahPosition } from "@/server/qaidah-session";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me/qaidah — موضع صاحب الحساب الطالب في القاعدة المدنية (لصفحته). null إن ليس طالبًا.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json({ position: await getMyQaidahPosition(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
