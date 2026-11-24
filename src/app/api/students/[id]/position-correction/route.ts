import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { correctStudentPosition, type PositionCorrectionReason } from "@/server/position-correction";
import { verr } from "@/server/errors";

const ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// POST /api/students/[id]/position-correction — تصحيح موضع الطالب في مراقي.
// الجسم: { fromSurah, fromAyah, toSurah, toAyah, reason, reasonNote? }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id: studentId } = await ctx.params;
    const body = (await req.json()) as {
      fromSurah?: unknown;
      fromAyah?: unknown;
      toSurah?: unknown;
      toAyah?: unknown;
      reason?: unknown;
      reasonNote?: unknown;
    };

    const fromSurah = typeof body.fromSurah === "number" ? body.fromSurah : undefined;
    const fromAyah = typeof body.fromAyah === "number" ? body.fromAyah : undefined;
    const toSurah = typeof body.toSurah === "number" ? body.toSurah : undefined;
    const toAyah = typeof body.toAyah === "number" ? body.toAyah : undefined;
    const reason = body.reason as PositionCorrectionReason | undefined;

    if (!fromSurah || !fromAyah || !toSurah || !toAyah) throw verr("hifzRangeReversed");
    if (!reason) throw verr("raiseReasonRequired");

    await correctStudentPosition({
      studentId,
      actorId: actor.id,
      fromSurah,
      fromAyah,
      toSurah,
      toAyah,
      reason,
      reasonNote: typeof body.reasonNote === "string" ? body.reasonNote : undefined,
    });

    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
