import { Role } from "@prisma/client";

import { recordQaidahSession, getQaidahPosition } from "@/server/qaidah-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/students/[id]/qaidah-session — موضع الطالب في القاعدة (الباب + الدرس الحاليّان).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    return Response.json(await getQaidahPosition(id));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/students/[id]/qaidah-session — تقييم درس الطالب الحاليّ { mastered: bool }.
// «متقن» ينقل درسًا واحدًا بالترتيب؛ «غير متقن» يبقيه. القواعد المطلقة في الخادم.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.mastered !== "boolean") throw new ValidationError("حقل «متقن» مطلوب.");
    const position = await recordQaidahSession({ studentId: id, actorId: actor.id, mastered: b.mastered });
    return Response.json({ ok: true, position }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
