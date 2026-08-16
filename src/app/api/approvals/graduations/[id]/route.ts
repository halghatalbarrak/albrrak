import { Role } from "@prisma/client";
import { decideGraduation } from "@/server/graduation";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/approvals/graduations/[id] — المدير يعتمد/يرفض التخرّج ([id] = معرّف الاعتماد).
// الاعتماد ← الحالة GRADUATED ثمّ شهادة KHATM. غير المدير ← 403.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { decision?: unknown; note?: unknown };
    if (b.decision !== "APPROVED" && b.decision !== "REJECTED") {
      throw new ValidationError("قرار غير معروف (APPROVED | REJECTED).");
    }
    const result = await decideGraduation({
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
