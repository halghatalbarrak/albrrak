import { assignMaraqiTrack } from "@/server/track-assignment";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

// POST /api/students/[id]/assign-track — تعيين مسار مراقي (MANUAL).
// الجسم: { trackId, note? }. التحقّق من الصلاحية (معلّم/مدير) يجري في assignMaraqiTrack.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const b = (await req.json()) as { trackId?: unknown; note?: unknown };
    if (typeof b.trackId !== "string") throw verr("trackRequired");
    await assignMaraqiTrack({
      studentId: id,
      trackId: b.trackId,
      source: "MANUAL",
      actorId: actor.id,
      note: typeof b.note === "string" ? b.note : undefined,
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
