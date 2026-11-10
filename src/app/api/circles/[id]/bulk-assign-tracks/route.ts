import { prisma } from "@/lib/prisma";
import { assignMaraqiTrack } from "@/server/track-assignment";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

interface BulkItem {
  studentId: string;
  trackId: string;
  note?: string;
}

// POST /api/circles/[id]/bulk-assign-tracks — تعيين مسار جماعيّ لطلاب الحلقة (BULK).
// الجسم: { assignments: [{ studentId, trackId, note? }] }.
// كلّ تعيين مستقلّ — الفاشل لا يوقف الناجحين؛ نُعيد قائمةً بالنتائج.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id: circleId } = await ctx.params;
    const b = (await req.json()) as { assignments?: unknown };
    if (!Array.isArray(b.assignments) || b.assignments.length === 0) throw verr("bulkAssignmentsRequired");

    const items = b.assignments as BulkItem[];
    for (const item of items) {
      if (typeof item.studentId !== "string" || typeof item.trackId !== "string") throw verr("fieldRequiredOrInvalid");
    }

    // تحقّق أنّ الطلاب كلّهم ينتمون لهذه الحلقة.
    const circleStudentIds = await prisma.enrollment.findMany({
      where: { circleId, endedAt: null },
      select: { studentId: true },
    });
    const validIds = new Set(circleStudentIds.map((e) => e.studentId));
    for (const item of items) {
      if (!validIds.has(item.studentId)) throw verr("studentNotInThisCircle");
    }

    const results: { studentId: string; ok: boolean; error?: string }[] = [];
    for (const item of items) {
      try {
        await assignMaraqiTrack({
          studentId: item.studentId,
          trackId: item.trackId,
          source: "BULK",
          actorId: actor.id,
          note: item.note,
        });
        results.push({ studentId: item.studentId, ok: true });
      } catch (e) {
        results.push({ studentId: item.studentId, ok: false, error: e instanceof Error ? e.message : "خطأ غير معروف" });
      }
    }

    const failCount = results.filter((r) => !r.ok).length;
    return Response.json({ results, failCount }, { status: failCount === 0 ? 200 : 207 });
  } catch (e) {
    return errorResponse(e);
  }
}
