import { Role } from "@prisma/client";
import { softDeleteApplication } from "@/server/application";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// DELETE /api/admin/applications/[id] — حذفٌ ناعم لطلب قيد (PENDING/WAITLISTED/REJECTED).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await params;
    await softDeleteApplication(actor.id, id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
