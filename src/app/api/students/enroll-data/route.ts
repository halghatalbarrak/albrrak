import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { getEnrollFormData } from "@/server/enroll-data";

export const dynamic = "force-dynamic";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/students/enroll-data?circleId=…
// يُرجع البرامج والمسارات والمشرفين لنموذج التسجيل الكامل.
export async function GET(req: Request): Promise<Response> {
  try {
    await requireRoles(req, ROLES);
    const url = new URL(req.url);
    const circleId = url.searchParams.get("circleId") ?? "";
    const data = await getEnrollFormData(circleId);
    return Response.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
