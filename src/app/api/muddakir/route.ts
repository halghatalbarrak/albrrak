import { MuddakirDeliveryMode } from "@prisma/client";

import {
  assignSupervisor,
  enrollInMuddakir,
  listEnrollableStudents,
  listHafizForSupervisor,
  listMuddakirHafiz,
  listSupervisorsWithLoad,
} from "@/server/muddakir-enrollment";
import { MuddakirRequestType } from "@prisma/client";

import { requireMuddakir } from "@/server/muddakir-staff";
import { performOrRequest } from "@/server/muddakir-requests";
import { errorResponse } from "@/server/http";
import { AuthorizationError, ValidationError } from "@/server/errors";

// GET /api/muddakir — المدير (منصّةٌ أو برنامجٌ): الحفّاظ + المشرفون + المتاحون للإلحاق. المشرف:
// حفّاظه فقط للقراءة. (يقبل أدوار المدّكر المُحصَّرة كما الأدوار العامّة.)
export async function GET(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    if (actor.caps.manage) {
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

// POST /api/muddakir — مدير البرنامج/المنصّة ينفّذ مباشرة؛ الإداريّ يُنشئ طلباً معلّقاً (§٢).
// { action:"enroll", studentId, deliveryMode? } أو { action:"assign", studentId, supervisorId }.
export async function POST(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    if (!actor.caps.manage && !actor.caps.admin) throw new AuthorizationError("هذا الإجراء لمدير البرنامج أو الإداريّ.");
    const b = (await req.json()) as { action?: unknown; studentId?: unknown; supervisorId?: unknown; deliveryMode?: unknown };
    if (typeof b.studentId !== "string") throw new ValidationError("الحافظ مطلوب.");
    const studentId = b.studentId;

    if (b.action === "enroll") {
      const deliveryMode = b.deliveryMode === MuddakirDeliveryMode.REMOTE ? MuddakirDeliveryMode.REMOTE : MuddakirDeliveryMode.IN_PERSON;
      const r = await performOrRequest(actor, { type: MuddakirRequestType.ENROLL, payload: { studentId, deliveryMode }, studentId, direct: () => enrollInMuddakir({ studentId, actorId: actor.id, deliveryMode }) });
      return Response.json(r, { status: r.executed ? 201 : 202 });
    }
    if (b.action === "assign") {
      if (typeof b.supervisorId !== "string") throw new ValidationError("المشرف مطلوب.");
      const supervisorId = b.supervisorId;
      const r = await performOrRequest(actor, { type: MuddakirRequestType.ASSIGN_SUPERVISOR, payload: { studentId, supervisorId }, studentId, direct: () => assignSupervisor({ studentId, supervisorId, actorId: actor.id }) });
      return Response.json(r, { status: r.executed ? 201 : 202 });
    }
    throw new ValidationError("الإجراء مطلوب (enroll/assign).");
  } catch (e) {
    return errorResponse(e);
  }
}
