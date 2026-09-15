import { getMyLedger } from "@/server/economy";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// رصيد الطالب صاحب الحساب + دفتر حركاته — لصفحته «صفحتي». null إن لم يكن طالبًا.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getMyLedger(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
