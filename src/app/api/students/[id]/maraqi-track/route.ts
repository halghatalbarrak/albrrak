import { raiseMaraqiTrack } from "@/server/maraqi-track-ladder";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

// POST /api/students/[id]/maraqi-track — الرفع اليدويّ لمسار الطالب في السلّم (القرار ب).
// الجسم: { targetTrackId, reason }. صلاحية TRACK_PROMOTION تُتحقَّق في الخادم (غير المخوّل ← 403).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const b = (await req.json()) as { targetTrackId?: unknown; reason?: unknown };
    if (typeof b.targetTrackId !== "string") throw verr("targetTrackRequired");
    if (typeof b.reason !== "string" || !b.reason.trim()) throw verr("raiseReasonRequired");
    await raiseMaraqiTrack({ studentId: id, targetTrackId: b.targetTrackId, actorId: actor.id, reason: b.reason });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
