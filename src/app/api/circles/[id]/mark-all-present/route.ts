import { AttendanceStatus, Role } from "@prisma/client";
import { markStudentAttendance } from "@/server/attendance";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";
import { makeTimer } from "@/lib/timing";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/circles/[id]/mark-all-present — طلبٌ واحدٌ مجمَّع لتأشير كل الغائبين حاضرين.
// الجسم: { studentIds: string[], date: string }
// idempotent: يتجاهل من سُجِّل حضوره مسبقاً (upsert داخل markStudentAttendance).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = makeTimer();
  try {
    const actor = await requireRoles(req, ROLES);
    t.endAuth();
    const { id } = await ctx.params;
    const b = (await req.json()) as { studentIds?: unknown; date?: unknown };
    if (!Array.isArray(b.studentIds) || b.studentIds.length === 0) throw verr("studentRequired");
    if (typeof b.date !== "string") throw verr("dateRequired");
    const ids = (b.studentIds as unknown[]).filter((s): s is string => typeof s === "string");
    await Promise.all(
      ids.map((studentId) =>
        markStudentAttendance({
          circleId: id,
          studentId,
          status: AttendanceStatus.PRESENT,
          date: b.date as string,
          recorderId: actor.id,
        }),
      ),
    );
    t.endDb();
    t.log("/api/circles/[id]/mark-all-present");
    return new Response(JSON.stringify({ ok: true, count: ids.length }), {
      status: 201,
      headers: { "Content-Type": "application/json", "Server-Timing": t.header() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
