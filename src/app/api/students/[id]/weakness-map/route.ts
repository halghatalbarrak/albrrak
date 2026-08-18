import { Role } from "@prisma/client";

import { getStudentWeaknessMap } from "@/server/weakness-map";
import { assertTeachesStudent } from "@/server/daily-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/students/[id]/weakness-map — خريطة ضعف طالبٍ للكادر. قراءةٌ فقط.
// الحارس: المعلّم يرى طلابه فقط (assertTeachesStudent)؛ المدير/المشرف أيّ طالب.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    await assertTeachesStudent(actor.id, id);
    return Response.json(await getStudentWeaknessMap(id));
  } catch (e) {
    return errorResponse(e);
  }
}
