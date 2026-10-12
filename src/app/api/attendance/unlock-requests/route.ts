import { Role } from "@prisma/client";
import { listUnlockRequests } from "@/server/attendance-lock";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ROLES = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/attendance/unlock-requests — طلبات الفتح المعلّقة (للإدارة).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    const requests = await listUnlockRequests(actor.id);
    return Response.json({ requests });
  } catch (e) {
    return errorResponse(e);
  }
}
