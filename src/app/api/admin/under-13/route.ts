import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { listUnder13WithAccounts } from "@/server/under-13";

// GET /api/admin/under-13 — قائمة المستخدمين دون ١٣ الذين لديهم authId.
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER]);
    return Response.json(await listUnder13WithAccounts());
  } catch (e) {
    return errorResponse(e);
  }
}
