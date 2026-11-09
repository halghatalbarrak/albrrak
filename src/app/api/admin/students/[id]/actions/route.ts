import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";
import { transferStudent, suspendEnrollment, resumeEnrollment, expelStudent } from "@/server/enrollment";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const { id: studentId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      circleId?: string;
      reason?: string;
      returnAt?: string;
    };

    switch (body.action) {
      case "transfer": {
        if (!body.circleId) throw verr("circleNotFound");
        const { enrollmentId } = await transferStudent(actor.id, studentId, body.circleId);
        return Response.json({ enrollmentId }, { status: 200 });
      }
      case "suspend": {
        const reason = body.reason?.trim() ?? "";
        if (!reason) throw verr("suspendReasonRequired");
        const returnAt = body.returnAt ? new Date(body.returnAt) : null;
        await suspendEnrollment(actor.id, studentId, reason, returnAt);
        return new Response(null, { status: 204 });
      }
      case "resume": {
        await resumeEnrollment(actor.id, studentId);
        return new Response(null, { status: 204 });
      }
      case "expel": {
        const reason = body.reason?.trim() ?? "";
        if (!reason) throw verr("expelReasonRequired");
        await expelStudent(actor.id, studentId, reason);
        return new Response(null, { status: 204 });
      }
      default:
        return Response.json({ error: "action غير معروف" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
