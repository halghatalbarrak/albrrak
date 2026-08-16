import { Role } from "@prisma/client";
import { listPendingStageTransitions } from "@/server/stage-transition";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/approvals/stage-transitions — اقتراحات انتقال المرحلة المعلَّقة (المدير فقط).
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const items = await listPendingStageTransitions();
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
