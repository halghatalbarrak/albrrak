import { hafizViewForUser } from "@/server/muddakir-today-view";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/muddakir/today — عرض يوم الحافظ الكامل (للحافظ الملحق نفسه فقط). يُخزَّن للعمل بلا إنترنت.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    const view = await hafizViewForUser(actor.id);
    return Response.json(view);
  } catch (e) {
    return errorResponse(e);
  }
}
