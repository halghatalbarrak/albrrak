import { Role, type AttendanceStatus } from "@prisma/client";
import { getSessionRoster, recordSession, type AttendanceMark } from "@/server/attendance";
import { assertTeacherOwnsCircle } from "@/server/circles";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

const RECORDER_ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/circles/[id]/attendance?date=YYYY-MM-DD — قائمة الرصد ليوم (حاضر افتراضًا).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, RECORDER_ROLES);
    const { id } = await ctx.params;
    if (actor.roles.includes(Role.TEACHER) && !actor.roles.some((r) => r === Role.CIRCLE_MANAGER || r === Role.SUPER_ADMIN)) {
      await assertTeacherOwnsCircle(actor.id, id);
    }
    const date = new URL(req.url).searchParams.get("date");
    if (!date) throw verr("dateRequired");
    const roster = await getSessionRoster(id, date);
    return Response.json({ roster });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/circles/[id]/attendance — رصد جلسة (الاستثناءات فقط). المعلم حلقاته فقط.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, RECORDER_ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as { date?: unknown; exceptions?: unknown };
    if (typeof b.date !== "string") throw verr("dateRequired");
    if (!Array.isArray(b.exceptions)) throw verr("exceptionsListRequired");

    const exceptions: AttendanceMark[] = b.exceptions.map((raw) => {
      const m = raw as { studentId?: unknown; status?: unknown; note?: unknown };
      if (typeof m.studentId !== "string" || typeof m.status !== "string") {
        throw verr("invalidException");
      }
      return {
        studentId: m.studentId,
        status: m.status as AttendanceStatus,
        ...(typeof m.note === "string" ? { note: m.note } : {}),
      };
    });

    if (actor.roles.includes(Role.TEACHER) && !actor.roles.some((r) => r === Role.CIRCLE_MANAGER || r === Role.SUPER_ADMIN)) {
      await assertTeacherOwnsCircle(actor.id, id);
    }
    const result = await recordSession({
      circleId: id,
      date: b.date,
      exceptions,
      recorderId: actor.id,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
