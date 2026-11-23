import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { listUnder13WithAccounts, listUsersNoBirthDate } from "@/server/under-13";

// GET /api/admin/under-13 — قائمة المستخدمين دون ١٣ ومن لا تاريخ ميلاد لهم.
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER]);
    const [under13, noBirthDate] = await Promise.all([
      listUnder13WithAccounts(),
      listUsersNoBirthDate(),
    ]);
    return Response.json({ under13, noBirthDate });
  } catch (e) {
    return errorResponse(e);
  }
}
