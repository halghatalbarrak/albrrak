import { hafizHomeForUser } from "@/server/muddakir-today-view";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/muddakir/today — بيت الحافظ بحسب طوره (حفظ ⟵ الخطّة؛ تثبيت/دائم ⟵ الورد، §١٢).
// للحافظ الملحق نفسه فقط. يُخزَّن للعمل بلا إنترنت. لا مواضع مفاجئة هنا (خاصّةٌ بالمشرف، تعديل ٣).
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await hafizHomeForUser(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
