import { Role } from "@prisma/client";

import { listSellableItems } from "@/server/market";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/market/items — السلع المتاحة للبيع (شبكة شاشة البائع). للبائع وحده.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.SELLER]);
    return Response.json({ items: await listSellableItems(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
