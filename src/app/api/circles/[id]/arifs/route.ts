import { Role } from "@prisma/client";
import {
  appointArif,
  dismissArif,
  listAppointableStudents,
  listCircleArifs,
} from "@/server/arif";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/circles/[id]/arifs — عرفاء الحلقة النشطون + الطلاب المؤهّلون للتعيين.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const [arifs, candidates] = await Promise.all([
      listCircleArifs(id),
      listAppointableStudents(id),
    ]);
    return Response.json({ arifs, candidates });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/circles/[id]/arifs — تعيين/عزل عريف { arifUserId, action:"appoint"|"dismiss" }.
// لا يعيّن/يعزل إلا معلّم الحلقة (يُتحقَّق في الخادم).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as { arifUserId?: unknown; action?: unknown };
    if (typeof b.arifUserId !== "string") throw new ValidationError("العريف مطلوب.");
    if (b.action === "appoint") {
      const appt = await appointArif({ circleId: id, arifUserId: b.arifUserId, teacherId: actor.id });
      return Response.json({ appointmentId: appt.id }, { status: 201 });
    }
    if (b.action === "dismiss") {
      await dismissArif({ circleId: id, arifUserId: b.arifUserId, teacherId: actor.id });
      return Response.json({ ok: true });
    }
    throw new ValidationError("الإجراء مطلوب (appoint/dismiss).");
  } catch (e) {
    return errorResponse(e);
  }
}
