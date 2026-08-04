import { Role } from "@prisma/client";
import { listRecordableCircles } from "@/server/attendance";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/attendance/circles — الحلقات التي يرصدها الفاعل (المعلم حلقاته، المدير كلّها).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [
      Role.TEACHER,
      Role.CIRCLE_MANAGER,
      Role.SUPER_ADMIN,
    ]);
    const circles = await listRecordableCircles(actor.id);
    return Response.json({ circles });
  } catch (e) {
    return errorResponse(e);
  }
}
