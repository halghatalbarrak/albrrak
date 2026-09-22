import { Role } from "@prisma/client";
import { listReadyForStageExam } from "@/server/stage-exam-leave";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/stage-exams/ready — الطلاب الجاهزون لاختبار المرحلة ممّن يجوز لهذا المختبِر اختبارهم
// (إجازةٌ انقضت + لا اقتراح انتقالٍ معلّق + حياد). أدوار: المُسمِّع/المدير/المشرف.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.RECITER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const students = await listReadyForStageExam(actor.id);
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
