import { Role } from "@prisma/client";

import { getQaidahSessionBoard } from "@/server/qaidah-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/circles/[id]/qaidah-session — لوحة جلسة القاعدة لكل طلاب الحلقة (قراءةٌ فقط).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    return Response.json(await getQaidahSessionBoard(actor.id, id));
  } catch (e) {
    return errorResponse(e);
  }
}
