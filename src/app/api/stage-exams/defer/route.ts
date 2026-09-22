import { Role } from "@prisma/client";
import { deferStageExam } from "@/server/stage-exam-leave";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/stage-exams/defer — تأجيل دخول الطالب للاختبار أسبوعًا. المعلّم مرّةً واحدة؛ المتكرّر
// بيد الإدارة (القاعدة مطلقةٌ في deferStageExam). الجسم: { studentId, mainStageId? }.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.TECH_ADMIN]);
    const b = (await req.json()) as { studentId?: unknown; mainStageId?: unknown };
    if (typeof b.studentId !== "string") throw new ValidationError("الطالب مطلوب.");
    const result = await deferStageExam({
      studentId: b.studentId,
      actorId: actor.id,
      actorRoles: actor.roles,
      mainStageId: typeof b.mainStageId === "string" ? b.mainStageId : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
