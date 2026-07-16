import { getMyPage } from "@/server/me";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me — صفحة المستخدم عن نفسه. أيّ مُصادَق فعّال. بلا رقم هوية.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getMyPage(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
