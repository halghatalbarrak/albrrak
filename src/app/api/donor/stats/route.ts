import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { getDonorStats } from "@/server/donor-stats";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRoles(req, [Role.DONOR, Role.SUPER_ADMIN]);
    const stats = await getDonorStats();
    return Response.json(stats);
  } catch (e) {
    return errorResponse(e);
  }
}
