import { getFace } from "@/server/mushaf";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// GET /api/mushaf/faces/[page] — رابط صورة الوجه (SVG) وقائمة آياته (الحكم ٧). للمُصادَقين.
export async function GET(req: Request, ctx: { params: Promise<{ page: string }> }) {
  try {
    await requireAuth(req);
    const { page } = await ctx.params;
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1 || n > 604) throw new ValidationError("رقم وجهٍ غير صالح (١..٦٠٤).");
    return Response.json(await getFace(n));
  } catch (e) {
    return errorResponse(e);
  }
}
