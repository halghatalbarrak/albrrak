import { Role } from "@prisma/client";
import { revealApplicationNationalId } from "@/server/national-id";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/applications/[id]/reveal-id — كشف رقم الهوية للمُسجِّل، بطلبٍ صريح،
// وكل كشفٍ يُسجَّل (م٥). لا يظهر رقم الهوية في أي كشفٍ آخر.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRoles(req, [Role.REGISTRAR, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const nationalId = await revealApplicationNationalId({
      applicationId: id,
      viewerId: actor.id,
      viewerRoles: actor.roles,
    });
    return Response.json({ nationalId });
  } catch (e) {
    return errorResponse(e);
  }
}
