import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import {
  bulkCorrectCirclePositions,
  type PositionCorrectionReason,
} from "@/server/position-correction";
import { verr } from "@/server/errors";

const ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

interface CorrectionItem {
  studentId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

// POST /api/circles/[id]/bulk-correct-positions — تصحيح مواضع طلاب الحلقة دفعةً واحدة.
// الجسم: { corrections: [...], reason, reasonNote? }
// الأدوار: SUPER_ADMIN | CIRCLE_MANAGER فقط (المعلّم يحتاج آلية طلب لم تُبنَ بعد).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id: circleId } = await ctx.params;

    const body = (await req.json()) as {
      corrections?: unknown;
      reason?: unknown;
      reasonNote?: unknown;
    };

    if (!Array.isArray(body.corrections) || body.corrections.length === 0) {
      throw verr("bulkAssignmentsRequired");
    }

    const reason = body.reason as PositionCorrectionReason | undefined;
    if (!reason) throw verr("raiseReasonRequired");

    const reasonNote =
      typeof body.reasonNote === "string" ? body.reasonNote.trim() : undefined;

    const corrections = body.corrections as CorrectionItem[];
    for (const c of corrections) {
      if (
        typeof c.studentId !== "string" ||
        typeof c.fromSurah !== "number" ||
        typeof c.fromAyah !== "number" ||
        typeof c.toSurah !== "number" ||
        typeof c.toAyah !== "number"
      ) {
        throw verr("fieldRequiredOrInvalid");
      }
    }

    const result = await bulkCorrectCirclePositions({
      circleId,
      corrections,
      reason,
      reasonNote,
      actorId: actor.id,
    });

    return Response.json(result, { status: result.errors.length === 0 ? 200 : 207 });
  } catch (e) {
    return errorResponse(e);
  }
}
