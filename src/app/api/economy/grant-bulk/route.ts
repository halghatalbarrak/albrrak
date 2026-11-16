import { Role } from "@prisma/client";
import { grantManualItem } from "@/server/economy";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/economy/grant-bulk
// منح جماعيّ: يُبدِّل حالة بندٍ لمجموعة طلاب (grant فقط — idempotent بالـAutoGrant).
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    const body = (await req.json()) as { studentIds?: string[]; pointItemId?: string; date?: string };
    if (!Array.isArray(body.studentIds) || !body.studentIds.length) throw verr("studentsRequired");
    if (!body.pointItemId) throw verr("economyItemNotFound");
    if (!body.date) throw verr("dateRequired");
    const results = await Promise.allSettled(
      body.studentIds.map((sid) => grantManualItem(actor.id, sid, body.pointItemId!, body.date!)),
    );
    const granted = results.filter((r) => r.status === "fulfilled" && r.value.granted).length;
    return new Response(JSON.stringify({ granted }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return errorResponse(e);
  }
}
