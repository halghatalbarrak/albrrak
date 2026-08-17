import { getSummary } from "@/server/summary";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/summary — ملخّص الصفحة الرئيسة حسب دور الداخل. قراءةٌ فقط، أيّ مُصادَق فعّال.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getSummary(actor));
  } catch (e) {
    return errorResponse(e);
  }
}
