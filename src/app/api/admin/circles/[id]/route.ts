import { Gender, Role, TimeSlot } from "@prisma/client";
import { softDeleteCircle, getCircleForEdit, updateCircle } from "@/server/circles";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];
const READERS = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.REGISTRAR];

// GET /api/admin/circles/[id] — بيانات الحلقة لنموذج التعديل.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, READERS);
    const { id } = await ctx.params;
    const circle = await getCircleForEdit(id);
    return Response.json({ circle });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/circles/[id] — تعديل بيانات الحلقة.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await ctx.params;
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.timeSlot !== TimeSlot.ASR && b.timeSlot !== TimeSlot.MAGHRIB && b.timeSlot !== TimeSlot.ISHA) throw verr("circleTimeSlotInvalid");
    if (b.gender !== Gender.MALE && b.gender !== Gender.FEMALE) throw verr("circleGenderInvalid");
    if (typeof b.nameAr !== "string") throw verr("circleNameRequired");
    const teacherId = typeof b.teacherId === "string" && b.teacherId ? b.teacherId : null;
    await updateCircle(actor.id, id, {
      nameAr: b.nameAr,
      timeSlot: b.timeSlot as TimeSlot,
      gender: b.gender as Gender,
      location: typeof b.location === "string" && b.location.trim() ? b.location.trim() : null,
      teacherId,
    });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE /api/admin/circles/[id] — حذف ناعم للحلقة (يُمنع إن كان فيها طلابٌ نشطون).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id } = await ctx.params;
    await softDeleteCircle(actor.id, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
