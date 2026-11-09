import { Role } from "@prisma/client";
import { softDeleteStudent } from "@/server/students";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// DELETE /api/admin/students/[id] — حذف ناعم للطالب (يُمنع إن كان لديه انتساب نشط).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await ctx.params;
    await softDeleteStudent(actor.id, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
