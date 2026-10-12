import { Role } from "@prisma/client";
import { getUnifiedBoard } from "@/server/unified-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { makkahDayDate } from "@/lib/makkah-day";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/circles/[id]/unified?date=YYYY-MM-DD — لوحة الحلقة الموحّدة (حضور + وجهة اليوم لكلّ طالب).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const date = new URL(req.url).searchParams.get("date") ?? makkahDayDate(new Date());
    return Response.json(await getUnifiedBoard(actor.id, id, date));
  } catch (e) {
    return errorResponse(e);
  }
}
