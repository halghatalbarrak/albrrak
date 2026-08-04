import { Role } from "@prisma/client";
import { recordPaceTest } from "@/server/maraqi";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/students/[id]/pace-test — تسجيل اختبار المقطع وإسناد المسار (§٨٫٥).
// قاعدة مطلقة: المُختبِر ليس معلم الطالب (يُتحقَّق في الخادم). غير الكادر ← 403.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [
      Role.TEACHER,
      Role.CIRCLE_MANAGER,
      Role.SUPER_ADMIN,
    ]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { linesMemorized?: unknown };
    if (typeof b.linesMemorized !== "number") {
      throw new ValidationError("قدر الحفظ (بالأسطر) مطلوب.");
    }
    const result = await recordPaceTest({
      studentId: id,
      administeredBy: actor.id,
      linesMemorized: b.linesMemorized,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
