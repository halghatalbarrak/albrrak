import { decideAttendanceUnlock } from "@/server/attendance-lock";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/attendance/unlock/[id]/decision — بتّ طلب فتحٍ (id = معرّف الاعتماد).
// الجسم: { decision: APPROVED|REJECTED, note? }. صلاحية ATTENDANCE_UNLOCK تُتحقَّق في الخادم.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const b = (await req.json()) as { decision?: unknown; note?: unknown };
    if (b.decision !== "APPROVED" && b.decision !== "REJECTED") {
      throw new ValidationError("القرار مطلوب (APPROVED/REJECTED).");
    }
    const decided = await decideAttendanceUnlock({
      approvalId: id,
      decidedBy: actor.id,
      decision: b.decision,
      ...(typeof b.note === "string" ? { note: b.note } : {}),
    });
    return Response.json({ status: decided.status });
  } catch (e) {
    return errorResponse(e);
  }
}
