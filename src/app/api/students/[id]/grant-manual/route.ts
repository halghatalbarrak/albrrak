import { Role } from "@prisma/client";
import { grantManualItem } from "@/server/economy";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/students/[id]/grant-manual
// يُبدِّل حالة منح بندٍ يدويٍّ (toggle): منح ← إلغاء ← منح.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id: studentId } = await ctx.params;
    const body = (await req.json()) as { pointItemId?: string; date?: string };
    if (!body.pointItemId) throw verr("economyItemNotFound");
    if (!body.date) throw verr("dateRequired");
    const result = await grantManualItem(actor.id, studentId, body.pointItemId, body.date);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return errorResponse(e);
  }
}
