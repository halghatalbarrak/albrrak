import { Role } from "@prisma/client";
import { getUnifiedBoard } from "@/server/unified-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { makkahDayDate } from "@/lib/makkah-day";
import { makeTimer } from "@/lib/timing";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/circles/[id]/unified?date=YYYY-MM-DD — لوحة الحلقة (قائمة خفيفة بلا today/qaidah).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = makeTimer();
  try {
    const actor = await requireRoles(req, ROLES);
    t.endAuth();
    const { id } = await ctx.params;
    const date = new URL(req.url).searchParams.get("date") ?? makkahDayDate(new Date());
    const data = await getUnifiedBoard(actor.id, id, date);
    t.endDb();
    t.log("/api/circles/[id]/unified");
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Server-Timing": t.header() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
