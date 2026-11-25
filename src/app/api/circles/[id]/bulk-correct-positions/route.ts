import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { correctStudentPosition, type PositionCorrectionReason } from "@/server/position-correction";
import { verr } from "@/server/errors";
import { prisma } from "@/lib/prisma";

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
// الأدوار: SUPER_ADMIN | CIRCLE_MANAGER ينفّذان مباشرةً.
// TEACHER: يُنفَّذ مباشرةً في هذه المرحلة (البنية التحتية للاعتماد تُضاف لاحقاً).
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

    // التحقّق من أن الطلاب ينتمون لهذه الحلقة
    const enrollments = await prisma.enrollment.findMany({
      where: { circleId, endedAt: null },
      select: { studentId: true },
    });
    const circleStudentIds = new Set(enrollments.map((e) => e.studentId));

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
      if (!circleStudentIds.has(c.studentId)) {
        throw verr("studentNotInThisCircle");
      }
    }

    // تطبيق التصحيح لكل طالب
    const errors: { studentId: string; error: string }[] = [];
    let corrected = 0;

    for (const c of corrections) {
      try {
        await correctStudentPosition({
          studentId: c.studentId,
          actorId: actor.id,
          fromSurah: c.fromSurah,
          fromAyah: c.fromAyah,
          toSurah: c.toSurah,
          toAyah: c.toAyah,
          reason,
          reasonNote: reasonNote || "تصحيح بعد خلل تسجيل الحفظ",
        });
        corrected++;
      } catch (e) {
        errors.push({
          studentId: c.studentId,
          error: e instanceof Error ? e.message : "خطأ غير معروف",
        });
      }
    }

    return Response.json({ corrected, errors }, { status: errors.length === 0 ? 200 : 207 });
  } catch (e) {
    return errorResponse(e);
  }
}
