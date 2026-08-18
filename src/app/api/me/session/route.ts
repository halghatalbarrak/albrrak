import { getMyStudentSession } from "@/server/me";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me/session — لوحة الطالب عن نفسه (موضعه · رسوخه · اليوم · دورته). قراءةٌ فقط.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getMyStudentSession(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
