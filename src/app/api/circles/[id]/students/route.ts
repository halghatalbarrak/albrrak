import { Role } from "@prisma/client";
import { listCircleStudents } from "@/server/daily-session";
import { assertTeacherOwnsCircle } from "@/server/circles";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/circles/[id]/students — طلاب الحلقة (لاختيار الطالب في شاشة الجلسة).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    if (actor.roles.includes(Role.TEACHER) && !actor.roles.some((r) => r === Role.CIRCLE_MANAGER || r === Role.SUPER_ADMIN)) {
      await assertTeacherOwnsCircle(actor.id, id);
    }
    const students = await listCircleStudents(id);
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
