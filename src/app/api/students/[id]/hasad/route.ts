import { Role } from "@prisma/client";
import { recordHasad, type HasadErrorInput, type HasadHesitationInput } from "@/server/hasad";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/students/[id]/hasad — المُسمِّع يسجّل الحصاد: أخطاءً عند آياتٍ وتردّداتٍ للأوجه (الحكم ٧).
// قاعدة مطلقة: المُسمِّع ليس معلم الطالب (يُتحقَّق في الخادم). غير الكادر ← 403.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.RECITER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { stageId?: unknown; errors?: unknown; hesitations?: unknown };
    if (typeof b.stageId !== "string") throw new ValidationError("المرحلة مطلوبة.");
    if (!Array.isArray(b.errors)) throw new ValidationError("قائمة الأخطاء مطلوبة.");

    const errors: HasadErrorInput[] = b.errors.map((raw) => {
      const e = raw as { pageNo?: unknown; errorType?: unknown; surah?: unknown; ayah?: unknown };
      if (typeof e.pageNo !== "number" || typeof e.errorType !== "string") {
        throw new ValidationError("خطأٌ غير صالح (يلزم صفحة ونوع).");
      }
      return {
        pageNo: e.pageNo,
        errorType: e.errorType as HasadErrorInput["errorType"],
        ...(typeof e.surah === "number" ? { surah: e.surah } : {}),
        ...(typeof e.ayah === "number" ? { ayah: e.ayah } : {}),
      };
    });

    const hesitations: HasadHesitationInput[] = Array.isArray(b.hesitations)
      ? b.hesitations.map((raw) => {
          const h = raw as { faceNo?: unknown };
          if (typeof h.faceNo !== "number") throw new ValidationError("تردّدٌ غير صالح (يلزم رقم وجه).");
          return { faceNo: h.faceNo };
        })
      : [];

    const outcome = await recordHasad({
      studentId: id,
      stageId: b.stageId,
      reciterId: actor.id,
      errors,
      hesitations,
    });
    return Response.json(outcome, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
