import { Role } from "@prisma/client";
import { revealStudentNationalId } from "@/server/students";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/students/[id]/reveal-id — كشف رقم هوية طالبٍ مقبول، للمُسجِّل بطلبٍ صريح.
// كل كشفٍ يُكتب سطرًا في سجل الاطّلاع (م٥). لا يظهر في أي كشفٍ افتراضيّ.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRoles(req, [Role.REGISTRAR, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const nationalId = await revealStudentNationalId({
      studentId: id,
      viewerId: actor.id,
      viewerRoles: actor.roles,
    });
    return Response.json({ nationalId });
  } catch (e) {
    return errorResponse(e);
  }
}
