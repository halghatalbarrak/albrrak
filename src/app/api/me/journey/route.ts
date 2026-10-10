import { getMyJourney } from "@/server/gamification/journey";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me/journey — رحلة الطالب صاحب الحساب (خرائط/سلسلة/نقاط/أوسمة/تحفيز). null لغير الطالب.
// يُقيّم الأوسمة بكسلٍ عند العرض (منحٌ idempotent).
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getMyJourney(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
