import { Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { setCircleDefaultProgram } from "@/server/placement-actions";
import { ValidationError } from "@/server/errors";
import { errorResponse } from "@/server/http";

// PATCH { programId } → البرنامج الافتراضيّ للحلقة (للمنضمّ الجديد، ق١). لا يمسّ القيود القائمة.
const ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.TECH_ADMIN];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as { programId?: unknown };
    if (typeof b.programId !== "string" || !b.programId) throw new ValidationError("البرنامج مطلوب.");
    await setCircleDefaultProgram({ actorId: actor.id, circleId: id, programId: b.programId });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
