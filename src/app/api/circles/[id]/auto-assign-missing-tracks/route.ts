import { autoAssignMissingTracks } from "@/server/track-assignment";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { prisma } from "@/lib/prisma";

// POST /api/circles/[id]/auto-assign-missing-tracks
// يُعيَّن المسار التلقائيّ (AUTO_FROM_FRONTIER) لكلّ طلاب الحلقة المراقييّن بلا مسار.
// لا يمسّ الطلاب الذين لديهم مسارٌ نشط.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id: circleId } = await ctx.params;
    const result = await autoAssignMissingTracks(circleId, actor.id, prisma);
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
    const enrollments = await prisma.enrollment.findMany({
      where: { circleId, endedAt: null, program: { key: "MARAQI" } },
      select: { studentId: true, student: { select: { user: { select: { nameAsInId: true } } } } },
    });
    if (!enrollments.length) return Response.json({ count: 0, students: [] });
    const withTrack = await prisma.trackAssignment.findMany({
      where: { studentId: { in: enrollments.map((e) => e.studentId) }, endedAt: null },
      select: { studentId: true },
    });
    const withTrackSet = new Set(withTrack.map((a) => a.studentId));
    const without = enrollments.filter((e) => !withTrackSet.has(e.studentId));
    return Response.json({
      count: without.length,
      students: without.map((e) => ({ studentId: e.studentId, name: e.student.user.nameAsInId })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
