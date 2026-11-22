import { Role } from "@prisma/client";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import {
  getTeacherReport,
  getSupervisorReport,
  getAdminReport,
  getStudentReport,
  getMuddakirReport,
  isActiveMuddakirSupervisor,
  reportToday,
} from "@/server/report-daily";

// GET /api/report/daily?date=YYYY-MM-DD
// يُعيد تقرير اليوم بحسب دور المستخدم.
export async function GET(req: Request): Promise<Response> {
  try {
    const actor = await requireAuth(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? reportToday();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "تنسيق التاريخ غير صحيح — YYYY-MM-DD" }, { status: 400 });
    }

    const roles = actor.roles as Role[];

    // مُدّكِر: ابحث عن إشراف نشط
    if (!roles.includes(Role.SUPER_ADMIN) && !roles.includes(Role.CIRCLE_MANAGER) && !roles.includes(Role.TEACHER)) {
      if (await isActiveMuddakirSupervisor(actor.id)) {
        const report = await getMuddakirReport(actor.id, date);
        return Response.json(report);
      }
    }

    if (roles.includes(Role.SUPER_ADMIN)) {
      const report = await getAdminReport(date);
      return Response.json(report);
    }

    if (roles.includes(Role.CIRCLE_MANAGER)) {
      const report = await getSupervisorReport(date);
      return Response.json(report);
    }

    if (roles.includes(Role.TEACHER)) {
      const reports = await getTeacherReport(actor.id, date);
      return Response.json(reports);
    }

    if (roles.includes(Role.STUDENT)) {
      const report = await getStudentReport(actor.id, date);
      return Response.json(report);
    }

    // دور بلا تقرير محدّد
    return Response.json({ kind: "none", date });
  } catch (e) {
    return errorResponse(e);
  }
}
