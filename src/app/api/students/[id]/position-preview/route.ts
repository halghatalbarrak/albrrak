import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { nextUnitAfterPosition } from "@/server/track-units";

const ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// GET /api/students/[id]/position-preview?toSurah=X&toAyah=Y
// معاينة الوحدة التالية بعد تصحيح الموضع إلى (toSurah:toAyah) — بلا كتابةٍ في قاعدة البيانات.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, ROLES);
    const { id: studentId } = await ctx.params;
    const url = new URL(req.url);
    const toSurah = Number(url.searchParams.get("toSurah") ?? 0);
    const toAyah = Number(url.searchParams.get("toAyah") ?? 0);
    if (!toSurah || !toAyah) return Response.json({ unit: null });
    const unit = await nextUnitAfterPosition(studentId, toSurah, toAyah);
    return Response.json({ unit: unit ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
