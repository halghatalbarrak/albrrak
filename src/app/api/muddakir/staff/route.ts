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
import { AuthorizationError, ValidationError } from "@/server/errors";

// GET /api/muddakir/staff — الطاقم الحاليّ + مقترحو الإشراف (نصف القرآن) + المستخدمون المتاحون.
// لمدير البرنامج/المنصّة (manage) وحده — لا يطّلع عليها الإداريّ.
export async function GET(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    if (!actor.caps.manage) throw new AuthorizationError("شاشة الطاقم لمدير البرنامج.");
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
    if (typeof b.userId !== "string") throw new ValidationError("المستخدم مطلوب.");
    if (typeof b.role !== "string" || !(Object.values(MuddakirStaffRole) as string[]).includes(b.role)) throw new ValidationError("الدور مطلوب.");
    const role = b.role as MuddakirStaffRole;
    if (b.action === "assign") return Response.json(await assignStaff({ actorUserId: actor.id, targetUserId: b.userId, role }), { status: 201 });
    if (b.action === "end") return Response.json(await endStaff({ actorUserId: actor.id, targetUserId: b.userId, role }));
    throw new ValidationError("الإجراء مطلوب (assign/end).");
  } catch (e) {
    return errorResponse(e);
  }
}
