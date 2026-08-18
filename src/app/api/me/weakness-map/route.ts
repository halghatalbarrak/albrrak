import { getMyWeaknessMap } from "@/server/weakness-map";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me/weakness-map — خريطة الطالب عن نفسه فقط (يُشتقّ studentId من هويّته).
// لا يمكن أن يرى أحدٌ خريطة غيره من هنا — المعرّف من الجلسة لا من المسار. قراءةٌ فقط.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json(await getMyWeaknessMap(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}
