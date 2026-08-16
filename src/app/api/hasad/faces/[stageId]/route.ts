import { Role } from "@prisma/client";
import { getHizbFaces } from "@/server/hasad";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/hasad/faces/[stageId] — أوجه الحزب (صفحاته) لشاشة الحصاد. للكادر (المُسمِّع/المدير).
export async function GET(req: Request, ctx: { params: Promise<{ stageId: string }> }) {
  try {
    await requireRoles(req, [Role.RECITER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { stageId } = await ctx.params;
    return Response.json(await getHizbFaces(stageId));
  } catch (e) {
    return errorResponse(e);
  }
}
