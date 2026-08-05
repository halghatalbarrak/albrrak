import { Role } from "@prisma/client";
import { listCircleStudents } from "@/server/daily-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/circles/[id]/students — طلاب الحلقة (لاختيار الطالب في شاشة الجلسة).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const students = await listCircleStudents(id);
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
