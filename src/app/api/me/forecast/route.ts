import { getMyForecast } from "@/server/forecast";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me/forecast — تقديرٌ إرشاديّ للطالب عن نفسه. قراءةٌ فقط.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getMyForecast(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
