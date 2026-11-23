import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { getChildSummary } from "@/server/guardian-summary";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

// GET /api/guardian/children/[studentId]
// ملخّص الابن: سجل الحضور ٣٠ يومًا + متوسّط الحلقة.
// IDOR: getChildSummary يتحقّق أنّ الوليّ مرتبطٌ بالطالب.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> },
): Promise<Response> {
  try {
    const actor = await requireRoles(req, [Role.GUARDIAN, Role.SUPER_ADMIN]);
    const { studentId } = await params;
    if (!studentId) return Response.json({ error: "MISSING_STUDENT_ID" }, { status: 400 });
    const summary = await getChildSummary(actor.id, studentId);
    return Response.json(summary);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return new Response(null, { status: 403 });
    }
    return errorResponse(e);
  }
}
