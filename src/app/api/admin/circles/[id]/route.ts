import { Role } from "@prisma/client";
import { softDeleteCircle } from "@/server/circles";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// DELETE /api/admin/circles/[id] — حذف ناعم للحلقة (يُمنع إن كان فيها طلابٌ نشطون).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await ctx.params;
    await softDeleteCircle(actor.id, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
