import { Role } from "@prisma/client";
import { proposeReadingTest } from "@/server/placement";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/students/[id]/reading-test — المُسجِّل يسجّل اختبار القراءة ويقترح التحديد.
// §٦٫٣: المُسجِّل يقرر، والمدير يعتمد قبل النفاذ. غير المُسجِّل ← 403.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRoles(req, [Role.REGISTRAR, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { notes?: unknown; readsFluently?: unknown; circleId?: unknown };
    if (typeof b.readsFluently !== "boolean") {
      throw new ValidationError("قرار «يجيد النظر» مطلوب.");
    }
    if (typeof b.notes !== "string") throw new ValidationError("ملاحظات المختبر مطلوبة.");
    const approval = await proposeReadingTest({
      studentId: id,
      examinerId: actor.id,
      notes: b.notes,
      readsFluently: b.readsFluently,
      circleId: typeof b.circleId === "string" ? b.circleId : null,
    });
    return Response.json({ approvalId: approval.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
