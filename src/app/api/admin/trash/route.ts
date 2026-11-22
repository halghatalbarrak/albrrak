import { Role } from "@prisma/client";
import { listTrashItems } from "@/server/trash";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const MANAGERS = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRoles(req, MANAGERS);
    const items = await listTrashItems();
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
