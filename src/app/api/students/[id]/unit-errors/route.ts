import { setUnitErrors } from "@/server/daily-session";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";
import { makeTimer } from "@/lib/timing";

// POST /api/students/[id]/unit-errors — ضبط أخطاء وحدةٍ بشكلٍ مطلق (idempotent، الحكم ٥).
// يختلف عن review-error في أنّه يحذف أخطاء اليوم أوّلاً ثم يُنشئ العدد المطلوب.
// القيمة ٠ تُصفّر أخطاء اليوم فقط دون مساس الأيام السابقة.
// إلغاء الترميم ممكنٌ إن كان الترميم من اليوم نفسه (المعلّم يصحّح حكمه).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = makeTimer();
  try {
    const actor = await requireAuth(req);
    t.endAuth();
    const { id } = await ctx.params;
    const b = (await req.json()) as { sessionId?: unknown; errorCount?: unknown; date?: unknown };
    if (typeof b.sessionId !== "string") throw verr("segmentRequired");
    if (typeof b.errorCount !== "number") throw verr("errorsCountRequired");
    if (typeof b.date !== "string") throw verr("reviewDateRequired");
    const result = await setUnitErrors({
      studentId: id,
      sessionId: b.sessionId,
      errorCount: b.errorCount,
      date: b.date,
      actorId: actor.id,
    });
    t.endDb();
    t.log("/api/students/[id]/unit-errors");
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json", "Server-Timing": t.header() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
