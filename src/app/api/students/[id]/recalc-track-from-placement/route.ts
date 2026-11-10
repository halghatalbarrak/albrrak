import { assignMissingTrackForStudent } from "@/server/track-assignment";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/students/[id]/recalc-track-from-placement
// يقترح مسار الطالب من تسكينه/جلساته ويُعيَّنه (AUTO_FROM_FRONTIER) إن لم يكن له مسار.
// إن كان للطالب مسارٌ بالفعل → يُعيد { assigned: false } ويطلب استعمال assign-track.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id: studentId } = await ctx.params;
    const result = await assignMissingTrackForStudent(studentId, actor.id);
    return Response.json(result, { status: result.assigned ? 201 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
