import { Role } from "@prisma/client";
import { listReadyForHasad } from "@/server/hasad";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/hasad/ready — الطلاب الجاهزون للحصاد ممّن يجوز لهذا المُسمِّع حصادهم.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.RECITER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const students = await listReadyForHasad(actor.id);
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
