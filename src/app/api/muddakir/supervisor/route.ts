import { Role } from "@prisma/client";

import {
  approveTrackChange,
  confirmWeekRegularity,
  markHeard,
  recordSupervisorError,
  reverseWeekGrants,
  setReviewCycleDays,
  supervisorDashboard,
  supervisorHafizDetail,
} from "@/server/muddakir-supervisor";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.ARIF, Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// GET /api/muddakir/supervisor — لوحة المشرف (حفّاظه ومؤشّراتهم). ?studentId=… ⟵ تفصيل حافظٍ للقاء.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    const studentId = new URL(req.url).searchParams.get("studentId");
    if (studentId) return Response.json(await supervisorHafizDetail(actor.id, studentId));
    return Response.json(await supervisorDashboard(actor.id));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/muddakir/supervisor — أفعال المشرف. { action, studentId, … }.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    const b = (await req.json()) as { action?: unknown; studentId?: unknown; page?: unknown; lineNo?: unknown; track?: unknown; days?: unknown };
    if (typeof b.studentId !== "string") throw new ValidationError("الحافظ مطلوب.");
    const studentId = b.studentId;

    switch (b.action) {
      case "markHeard":
        if (typeof b.page !== "number") throw new ValidationError("الوجه مطلوب.");
        return Response.json(await markHeard({ actorUserId: actor.id, studentId, page: b.page }));
      case "recordError":
        if (typeof b.page !== "number" || typeof b.lineNo !== "number") throw new ValidationError("الصفحة والسطر مطلوبان.");
        return Response.json(await recordSupervisorError({ actorUserId: actor.id, studentId, page: b.page, lineNo: b.lineNo }));
      case "confirmWeek":
        return Response.json(await confirmWeekRegularity({ actorUserId: actor.id, studentId }));
      case "reverseWeek":
        return Response.json(await reverseWeekGrants({ actorUserId: actor.id, studentId }));
      case "approveTrack":
        return Response.json(await approveTrackChange({ actorUserId: actor.id, studentId, track: typeof b.track === "number" ? b.track : undefined }));
      case "setReviewCycle":
        if (typeof b.days !== "number") throw new ValidationError("دورة المراجعة مطلوبة.");
        return Response.json(await setReviewCycleDays({ actorUserId: actor.id, studentId, days: b.days }));
      default:
        throw new ValidationError("إجراءٌ غير معروف.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
