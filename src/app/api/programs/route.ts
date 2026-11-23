import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { listPrograms } from "@/server/circles";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

// GET /api/programs — قائمة البرامج للنماذج (معلّم/مدير).
export async function GET(req: Request): Promise<Response> {
  try {
    await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.REGISTRAR]);
    const programs = await listPrograms();
    return Response.json({ programs });
  } catch (e) {
    return errorResponse(e);
  }
}
