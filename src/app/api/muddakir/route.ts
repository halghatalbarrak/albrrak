import { MuddakirDeliveryMode } from "@prisma/client";

import {
  assignSupervisor,
  enrollInMuddakir,
  listEnrollableStudents,
  listHafizForSupervisor,
  listMuddakirHafiz,
  listSupervisorsWithLoad,
} from "@/server/muddakir-enrollment";
import { requireMuddakir } from "@/server/muddakir-staff";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

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

// POST /api/muddakir — مديرُ البرنامج/المنصّة فقط (التنفيذ المباشر). طلبات الإداريّ في و٢.
// { action:"enroll", studentId, deliveryMode? } أو { action:"assign", studentId, supervisorId }.
export async function POST(req: Request) {
  try {
    const actor = await requireMuddakir(req, "manage");
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
