import { MuddakirMode } from "@prisma/client";

import {
  approveTathbit,
  approveTrackChange,
  confirmWeekRegularity,
  markHeard,
  raiseHafizDegree,
  recordSupervisorError,
  reverseWeekGrants,
  setReviewCycleDays,
  supervisorDashboard,
  supervisorHafizDetail,
} from "@/server/muddakir-supervisor";
import { setStageMode } from "@/server/muddakir-stages";
import { requireMuddakir } from "@/server/muddakir-staff";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

// GET /api/muddakir/supervisor — لوحة المشرف (حفّاظه ومؤشّراتهم). ?studentId=… ⟵ تفصيل حافظٍ للقاء.
export async function GET(req: Request) {
  try {
    const actor = await requireMuddakir(req, "supervise");
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
    const actor = await requireMuddakir(req, "supervise");
    const b = (await req.json()) as { action?: unknown; studentId?: unknown; page?: unknown; lineNo?: unknown; track?: unknown; days?: unknown; mode?: unknown };
    if (typeof b.studentId !== "string") throw verr("hafizRequired");
    const studentId = b.studentId;

    switch (b.action) {
      case "markHeard":
        if (typeof b.page !== "number") throw verr("faceRequired");
        return Response.json(await markHeard({ actorUserId: actor.id, studentId, page: b.page }));
      case "recordError":
        if (typeof b.page !== "number" || typeof b.lineNo !== "number") throw verr("pageAndLineRequired");
        return Response.json(await recordSupervisorError({ actorUserId: actor.id, studentId, page: b.page, lineNo: b.lineNo }));
      case "confirmWeek":
        return Response.json(await confirmWeekRegularity({ actorUserId: actor.id, studentId }));
      case "reverseWeek":
        return Response.json(await reverseWeekGrants({ actorUserId: actor.id, studentId }));
      case "approveTrack":
        return Response.json(await approveTrackChange({ actorUserId: actor.id, studentId, track: typeof b.track === "number" ? b.track : undefined }));
      case "setReviewCycle":
        if (typeof b.days !== "number") throw verr("reviewCycleRequiredField");
        return Response.json(await setReviewCycleDays({ actorUserId: actor.id, studentId, days: b.days }));
      case "setMode": {
        const mode = b.mode === MuddakirMode.REVIEW_ONLY ? MuddakirMode.REVIEW_ONLY : MuddakirMode.ACTIVE;
        return Response.json(await setStageMode({ actorUserId: actor.id, studentId, mode }));
      }
      case "raiseDegree":
        return Response.json(await raiseHafizDegree({ actorUserId: actor.id, studentId }));
      case "approveTathbit":
        return Response.json(await approveTathbit({ actorUserId: actor.id, studentId }));
      default:
        throw verr("displayUnknownAction");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
