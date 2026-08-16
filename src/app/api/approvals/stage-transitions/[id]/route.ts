import { Role } from "@prisma/client";
import { decideStageTransition } from "@/server/stage-transition";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/approvals/stage-transitions/[id] — المدير يعتمد/يرفض الانتقال ([id] = معرّف الاعتماد).
// الاعتماد ← إتمام المرحلة الأصلية (الانتقال). غير المدير ← 403.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { decision?: unknown; note?: unknown };
    if (b.decision !== "APPROVED" && b.decision !== "REJECTED") {
      throw new ValidationError("قرار غير معروف (APPROVED | REJECTED).");
    }
    const result = await decideStageTransition({
      approvalId: id,
      decidedBy: actor.id,
      decision: b.decision,
      note: typeof b.note === "string" ? b.note : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
