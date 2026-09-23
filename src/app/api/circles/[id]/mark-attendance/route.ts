import { AttendanceStatus, Role } from "@prisma/client";
import { markStudentAttendance } from "@/server/attendance";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/circles/[id]/mark-attendance — تأشير حضور طالبٍ واحد (الشاشة الموحّدة).
// الجسم: { studentId, status, date }. «مستأذن» لا يُرسَل هنا — يُقدَّم عبر مسار العذر.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as { studentId?: unknown; status?: unknown; date?: unknown };
    if (typeof b.studentId !== "string") throw new ValidationError("الطالب مطلوب.");
    if (typeof b.date !== "string") throw new ValidationError("التاريخ مطلوب.");
    if (typeof b.status !== "string" || !Object.values(AttendanceStatus).includes(b.status as AttendanceStatus)) {
      throw new ValidationError("حالة حضورٍ غير معروفة.");
    }
    const res = await markStudentAttendance({ circleId: id, studentId: b.studentId, status: b.status as AttendanceStatus, date: b.date, recorderId: actor.id });
    return Response.json(res, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
