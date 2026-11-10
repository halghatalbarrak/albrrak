import { suggestTrackForStudent } from "@/server/student-setup";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/students/[id]/track-suggestion — المسار المقترح للطالب وقائمة المسارات المفعّلة.
// يُستخدَم من واجهة تعيين المسار (نافذة NO_TRACK). تحقّق المصادقة فقط — صلاحية assignMaraqiTrack تُحقَّق عند الحفظ.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await ctx.params;
    const suggestion = await suggestTrackForStudent(id);
    return Response.json(suggestion);
  } catch (e) {
    return errorResponse(e);
  }
}
