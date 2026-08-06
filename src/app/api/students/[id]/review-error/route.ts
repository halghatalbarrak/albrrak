import { Role } from "@prisma/client";
import { recordReviewError } from "@/server/daily-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/students/[id]/review-error — رصد أخطاء مراجعة مقطعٍ (الحكم ٥).
// خطآن ⟵ يعود المقطع حفظًا جديدًا. تسميعٌ مرن (الحكم ٦: المعلّم أو المُسنَد).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [
      Role.TEACHER,
      Role.CIRCLE_MANAGER,
      Role.SUPER_ADMIN,
      Role.ARIF,
    ]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { sessionId?: unknown; errorCount?: unknown; date?: unknown };
    if (typeof b.sessionId !== "string") throw new ValidationError("المقطع مطلوب.");
    if (typeof b.errorCount !== "number") throw new ValidationError("عدد الأخطاء مطلوب.");
    if (typeof b.date !== "string") throw new ValidationError("تاريخ المراجعة مطلوب.");
    const result = await recordReviewError({
      studentId: id,
      sessionId: b.sessionId,
      date: b.date,
      errorCount: b.errorCount,
      actorId: actor.id,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
