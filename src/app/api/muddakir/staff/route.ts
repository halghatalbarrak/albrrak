import { MuddakirStaffRole } from "@prisma/client";

import {
  assignStaff,
  endStaff,
  isPlatformManagerRoles,
  listAssignableUsers,
  listStaff,
  listSupervisorCandidates,
  requireMuddakir,
} from "@/server/muddakir-staff";
import { errorResponse } from "@/server/http";
import { verr, aerr } from "@/server/errors";

// GET /api/muddakir/staff — الطاقم الحاليّ + مقترحو الإشراف (نصف القرآن) + المستخدمون المتاحون.
// لمدير البرنامج/المنصّة (manage) وحده — لا يطّلع عليها الإداريّ.
export async function GET(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    if (!actor.caps.manage) throw aerr("staffScreenForManager");
    const [staff, supervisorCandidates, assignableUsers] = await Promise.all([
      listStaff(),
      listSupervisorCandidates(),
      listAssignableUsers(),
    ]);
    // تعيين «مدير البرنامج» لمدير المنصّة وحده (§٢).
    return Response.json({ canAssignManager: isPlatformManagerRoles(actor.roles), staff, supervisorCandidates, assignableUsers });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/muddakir/staff — { action:"assign"|"end", userId, role }. التنفيذ المباشر (manage)؛
// والخادم يقصر تعيين MANAGER على مدير المنصّة.
export async function POST(req: Request) {
  try {
    const actor = await requireMuddakir(req, "manage");
    const b = (await req.json()) as { action?: unknown; userId?: unknown; role?: unknown };
    if (typeof b.userId !== "string") throw verr("userRequired");
    if (typeof b.role !== "string" || !(Object.values(MuddakirStaffRole) as string[]).includes(b.role)) throw verr("roleRequired");
    const role = b.role as MuddakirStaffRole;
    if (b.action === "assign") return Response.json(await assignStaff({ actorUserId: actor.id, targetUserId: b.userId, role }), { status: 201 });
    if (b.action === "end") return Response.json(await endStaff({ actorUserId: actor.id, targetUserId: b.userId, role }));
    throw verr("actionRequiredAssignEnd");
  } catch (e) {
    return errorResponse(e);
  }
}
