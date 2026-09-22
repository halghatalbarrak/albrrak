import { Role } from "@prisma/client";
import { listOnLeaveForStaff } from "@/server/stage-exam-leave";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/stage-exams/on-leave — الطلاب في إجازة اختبار المرحلة (مؤشّر المعلّم + زرّ التأجيل).
// المعلّم يرى طلاب حلقاته؛ الإدارة الجميع. أدوار: المعلّم/المدير/المشرف.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const students = await listOnLeaveForStaff({ userId: actor.id, roles: actor.roles });
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
