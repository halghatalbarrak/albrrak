import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { getDashboardData } from "@/server/dashboard";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

const ALLOWED: Role[] = [
  Role.SUPER_ADMIN,
  Role.TECH_ADMIN,
  Role.CIRCLE_MANAGER,
  Role.TEACHER,
  Role.DONOR,
];

// GET /api/admin/dashboard — لوحة عمل المدير (محدودة بالدور).
export async function GET(req: Request): Promise<Response> {
  try {
    const actor = await requireRoles(req, ALLOWED);
    const data = await getDashboardData(actor.roles, actor.id);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
