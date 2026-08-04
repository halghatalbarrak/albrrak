import { getMaraqiLadder } from "@/server/maraqi";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/programs/maraqi/ladder — سلّم مراقي بالسورة والآية.
// رقم الحزب يُحجب عن غير الكادر (§٨٫٢: الطالب لا يرى «حزب»).
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    const ladder = await getMaraqiLadder({ roles: actor.roles });
    return Response.json(ladder);
  } catch (e) {
    return errorResponse(e);
  }
}
