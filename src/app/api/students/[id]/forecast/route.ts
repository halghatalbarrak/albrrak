import { Role } from "@prisma/client";

import { getStudentForecast } from "@/server/forecast";
import { assertTeachesStudent } from "@/server/daily-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/students/[id]/forecast — تقديرٌ إرشاديّ للكادر (المعلّم طلابه فقط). قراءةٌ فقط.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    await assertTeachesStudent(actor.id, id);
    return Response.json(await getStudentForecast(id));
  } catch (e) {
    return errorResponse(e);
  }
}
