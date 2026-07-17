import { Role } from "@prisma/client";
import { countPendingApplications } from "@/server/application";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/admin/pending-count — عدّاد الطلبات المعلّقة + أقدمها (للوحة المدير).
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    return Response.json(await countPendingApplications());
  } catch (e) {
    return errorResponse(e);
  }
}
