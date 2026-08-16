import { Role } from "@prisma/client";
import { listPendingGraduations } from "@/server/graduation";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/approvals/graduations — اقتراحات التخرّج المعلَّقة (المدير فقط).
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const items = await listPendingGraduations();
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
