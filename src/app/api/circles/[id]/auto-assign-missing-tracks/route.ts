import { autoAssignMissingTracks, getMissingTrackStudents } from "@/server/track-assignment";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/circles/[id]/auto-assign-missing-tracks
// يُعيَّن المسار التلقائيّ (AUTO_FROM_FRONTIER) لكلّ طلاب الحلقة المراقييّن بلا مسار.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id: circleId } = await ctx.params;
    const result = await autoAssignMissingTracks(circleId, actor.id);
    return Response.json(result, { status: result.failed > 0 ? 207 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}

// GET /api/circles/[id]/auto-assign-missing-tracks
// يُعيد عدد الطلاب المراقييّن بلا مسار + أسماؤهم (لعرض الشارة).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id: circleId } = await ctx.params;
    return Response.json(await getMissingTrackStudents(circleId));
  } catch (e) {
    return errorResponse(e);
  }
}
