import { Role } from "@prisma/client";
import { approveAttendanceDay } from "@/server/attendance-lock";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/circles/[id]/attendance/approve — «اعتماد حضور اليوم» (قفلٌ فوريّ). الجسم: { date }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as { date?: unknown };
    if (typeof b.date !== "string") throw new ValidationError("التاريخ مطلوب.");
    const lock = await approveAttendanceDay(id, b.date, actor.id);
    return Response.json({ lock }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
