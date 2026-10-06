import { MuddakirDeliveryMode, Role } from "@prisma/client";

import {
  assignSupervisor,
  canManageMuddakir,
  enrollInMuddakir,
  listEnrollableStudents,
  listHafizForSupervisor,
  listMuddakirHafiz,
  listSupervisorsWithLoad,
} from "@/server/muddakir-enrollment";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const VIEW_ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.ARIF];
const MANAGE_ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// GET /api/muddakir — المدير: الحفّاظ + المشرفون بأحمالهم + المتاحون للإلحاق. المشرف (ARIF):
// حفّاظه فقط للقراءة.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, VIEW_ROLES);
    if (canManageMuddakir(actor.roles)) {
      const [hafiz, supervisors, enrollable] = await Promise.all([
        listMuddakirHafiz(),
        listSupervisorsWithLoad(),
        listEnrollableStudents(),
      ]);
      return Response.json({ canManage: true, hafiz, supervisors, enrollable });
    }
    const hafiz = await listHafizForSupervisor(actor.id);
    return Response.json({ canManage: false, hafiz, supervisors: [], enrollable: [] });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/muddakir — المدير فقط. { action:"enroll", studentId, deliveryMode? } أو
// { action:"assign", studentId, supervisorId }.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGE_ROLES);
    const b = (await req.json()) as {
      action?: unknown;
      studentId?: unknown;
      supervisorId?: unknown;
      deliveryMode?: unknown;
    };
    if (typeof b.studentId !== "string") throw new ValidationError("الحافظ مطلوب.");

    if (b.action === "enroll") {
      const deliveryMode =
        b.deliveryMode === MuddakirDeliveryMode.REMOTE ? MuddakirDeliveryMode.REMOTE : MuddakirDeliveryMode.IN_PERSON;
      const res = await enrollInMuddakir({ studentId: b.studentId, actorId: actor.id, deliveryMode });
      return Response.json(res, { status: res.alreadyEnrolled ? 200 : 201 });
    }
    if (b.action === "assign") {
      if (typeof b.supervisorId !== "string") throw new ValidationError("المشرف مطلوب.");
      const res = await assignSupervisor({ studentId: b.studentId, supervisorId: b.supervisorId, actorId: actor.id });
      return Response.json(res, { status: 201 });
    }
    throw new ValidationError("الإجراء مطلوب (enroll/assign).");
  } catch (e) {
    return errorResponse(e);
  }
}
