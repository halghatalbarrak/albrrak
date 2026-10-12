import { unlockAttendanceDay } from "@/server/attendance-lock";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/circles/[id]/attendance/unlock — فتحٌ مباشر من صاحب صلاحية ATTENDANCE_UNLOCK.
// الجسم: { date, reason }. الصلاحيّة تُتحقَّق في الخادم (غير المخوّل ← 403).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const b = (await req.json()) as { date?: unknown; reason?: unknown };
    if (typeof b.date !== "string") throw new ValidationError("التاريخ مطلوب.");
    if (typeof b.reason !== "string" || !b.reason.trim()) throw new ValidationError("سبب الفتح مطلوب.");
    const lock = await unlockAttendanceDay({ circleId: id, date: b.date, reason: b.reason, actorId: actor.id });
    return Response.json({ lock }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
