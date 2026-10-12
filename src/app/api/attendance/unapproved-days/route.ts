import { Role } from "@prisma/client";
import { listUnapprovedDays } from "@/server/attendance-lock";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ROLES = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/attendance/unapproved-days — أيّامٌ رُصدت ولم يعتمدها المعلّم (للإدارة).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    const days = await listUnapprovedDays(actor.id);
    return Response.json({ days });
  } catch (e) {
    return errorResponse(e);
  }
}
