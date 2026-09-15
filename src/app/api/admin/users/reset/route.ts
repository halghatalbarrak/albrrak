import { Role } from "@prisma/client";

import { resetPassword } from "@/server/user-management";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ADMINS = [Role.SUPER_ADMIN, Role.TECH_ADMIN];

// POST /api/admin/users/reset — يولّد رابط إعادة تعيينٍ جديداً ويعيده.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ADMINS);
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.userId !== "string") throw new ValidationError("المعرّف مطلوب.");
    return Response.json(await resetPassword(actor.id, b.userId));
  } catch (e) {
    return errorResponse(e);
  }
}
