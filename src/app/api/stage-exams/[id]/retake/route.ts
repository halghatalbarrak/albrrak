import { Role } from "@prisma/client";
import { decideRetake } from "@/server/stage-transition";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/stage-exams/[id]/retake — المدير يقرّر إعادة اختبارٍ راسبٍ ونطاقها ومهلتها.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { scopeNote?: unknown; deadline?: unknown; note?: unknown };
    if (typeof b.scopeNote !== "string" || !b.scopeNote.trim()) {
      throw new ValidationError("نطاق الإعادة مطلوب.");
    }
    const result = await decideRetake({
      examId: id,
      decidedBy: actor.id,
      scopeNote: b.scopeNote,
      deadline: typeof b.deadline === "string" ? b.deadline : undefined,
      note: typeof b.note === "string" ? b.note : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
