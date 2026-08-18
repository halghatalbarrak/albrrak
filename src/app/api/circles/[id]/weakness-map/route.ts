import { Role } from "@prisma/client";

import { getCircleWeaknessMap, assertCircleAccess } from "@/server/weakness-map";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/circles/[id]/weakness-map — خريطة ضعف الحلقة للكادر. قراءةٌ فقط.
// الحارس: المعلّم يرى حلقته فقط؛ المدير/المشرف أيّ حلقة. لا يراها طالب.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    await assertCircleAccess(actor.id, id);
    return Response.json(await getCircleWeaknessMap(id));
  } catch (e) {
    return errorResponse(e);
  }
}
