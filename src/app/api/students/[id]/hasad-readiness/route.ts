import { Role } from "@prisma/client";
import { declareHasadReadiness } from "@/server/hasad";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/students/[id]/hasad-readiness — المعلم يعلن جاهزية طالبه للحصاد (§٨٫٩).
// لا يعلنها إلا معلمه (يُتحقَّق في الخادم).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { stageId?: unknown };
    if (typeof b.stageId !== "string") throw new ValidationError("المرحلة مطلوبة.");
    await declareHasadReadiness({ studentId: id, stageId: b.stageId, teacherId: actor.id });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
