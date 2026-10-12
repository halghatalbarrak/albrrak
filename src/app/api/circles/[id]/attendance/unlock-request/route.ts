import { Role } from "@prisma/client";
import { requestAttendanceUnlock } from "@/server/attendance-lock";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/circles/[id]/attendance/unlock-request — المعلّم يطلب فتح يومٍ مقفل. الجسم: { date, reason }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as { date?: unknown; reason?: unknown };
    if (typeof b.date !== "string") throw new ValidationError("التاريخ مطلوب.");
    if (typeof b.reason !== "string" || !b.reason.trim()) throw new ValidationError("سبب طلب الفتح مطلوب.");
    const approval = await requestAttendanceUnlock({ circleId: id, date: b.date, reason: b.reason, requestedBy: actor.id });
    return Response.json({ approvalId: approval.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
