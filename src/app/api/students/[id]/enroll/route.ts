import { Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { enrollStudent, getActiveEnrollment, getEnrollmentHistory } from "@/server/enrollment";
import { ValidationError } from "@/server/errors";
import { errorResponse } from "@/server/http";

// إسناد/نقل الطالب إلى حلقة — المدير فقط (بتفويضه الأصليّ).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { circleId?: unknown };
    if (typeof b.circleId !== "string" || b.circleId.trim() === "") {
      throw new ValidationError("حلقة غير محدّدة.");
    }
    const result = await enrollStudent({ studentId: id, circleId: b.circleId, actorId: actor.id });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

// السجلّ التاريخي للانتساب (النشط + المنتهي) — للعرض في شاشة المدير.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const [active, history] = await Promise.all([
      getActiveEnrollment(id),
      getEnrollmentHistory(id),
    ]);
    return Response.json({ active, history });
  } catch (e) {
    return errorResponse(e);
  }
}
