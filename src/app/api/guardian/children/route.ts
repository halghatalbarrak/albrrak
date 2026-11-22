import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { getGuardianChildrenData } from "@/server/guardian-page";

// GET /api/guardian/children?date=YYYY-MM-DD
// يُرجع أبناء وليّ الأمر لليوم المحدّد (أو اليوم الحاليّ إن لم يُحدَّد).
// محمي: GUARDIAN أو SUPER_ADMIN فقط. البيانات مقيّدة بأبناء هذا الوليّ فقط (IDOR safe).
export async function GET(req: Request): Promise<Response> {
  try {
    const actor = await requireRoles(req, [Role.GUARDIAN, Role.SUPER_ADMIN]);
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? undefined;
    // تحقّق من صيغة التاريخ إن أُرسل
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "تنسيق التاريخ غير صحيح — YYYY-MM-DD" }, { status: 400 });
    }
    const children = await getGuardianChildrenData(actor.id, date);
    return Response.json(children);
  } catch (e) {
    return errorResponse(e);
  }
}
