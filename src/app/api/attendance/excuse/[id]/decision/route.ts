import { decideExcuse } from "@/server/attendance";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/attendance/excuse/[id]/decision — قبول/رفض العذر.
// قاعدة مطلقة (§١٠٫٢): لا يقبل إلا صاحب صلاحية ABSENCE_EXCUSE (يُتحقَّق في الخادم)،
// وكلّ قبولٍ يُسجَّل بصاحبه. غير المخوّل ← 403.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const b = (await req.json()) as { decision?: unknown; note?: unknown };
    if (b.decision !== "APPROVED" && b.decision !== "REJECTED") {
      throw new ValidationError("القرار مطلوب (APPROVED/REJECTED).");
    }
    const approval = await decideExcuse({
      approvalId: id,
      decidedBy: actor.id,
      decision: b.decision,
      ...(typeof b.note === "string" ? { note: b.note } : {}),
    });
    return Response.json({ status: approval.status });
  } catch (e) {
    return errorResponse(e);
  }
}
