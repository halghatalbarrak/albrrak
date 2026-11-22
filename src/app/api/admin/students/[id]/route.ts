import { Role } from "@prisma/client";
import { getStudentForEdit, softDeleteStudent, updateStudent } from "@/server/students";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];
const READERS = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.REGISTRAR];

// GET /api/admin/students/[id] — بيانات الطالب لنموذج التعديل.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, READERS);
    const { id } = await ctx.params;
    const student = await getStudentForEdit(id);
    return Response.json({ student });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/students/[id] — تعديل بيانات الطالب.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await ctx.params;
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await updateStudent(actor.id, id, {
      schoolStage: typeof b.schoolStage === "string" ? b.schoolStage : undefined,
      priorHifzAmount: typeof b.priorHifzAmount === "string" ? b.priorHifzAmount : undefined,
      emergencyName: typeof b.emergencyName === "string" ? b.emergencyName : undefined,
      emergencyPhone: typeof b.emergencyPhone === "string" ? b.emergencyPhone : undefined,
      emergencyRelationId: typeof b.emergencyRelationId === "string" ? b.emergencyRelationId : undefined,
    });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE /api/admin/students/[id] — حذف ناعم للطالب (يُمنع إن كان لديه انتساب نشط).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await ctx.params;
    await softDeleteStudent(actor.id, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
