import { Role } from "@prisma/client";

import {
  approveGuardianGift,
  listPendingGuardianGifts,
  rejectGuardianGift,
} from "@/server/market";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// إدارة ثمرات الوليّ المعلّقة (م٦ب-٢) — للإدارة وحدها. الحرّاس في market.ts.
const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/admin/market/gifts — الثمرات بانتظار الموافقة (مع المقترِح والطالب المستهدف).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    return Response.json({ gifts: await listPendingGuardianGifts(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/market/gifts — اعتماد (action=approve + pricePoints) أو رفض (action=reject).
export async function PATCH(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.id !== "string") throw new ValidationError("المعرّف مطلوب.");
    if (body.action === "reject") {
      const item = await rejectGuardianGift(actor.id, body.id);
      return Response.json(item);
    }
    if (body.action === "approve") {
      if (typeof body.pricePoints !== "number") throw new ValidationError("القيمة المعتمَدة مطلوبة.");
      const item = await approveGuardianGift(actor.id, body.id, body.pricePoints);
      return Response.json(item);
    }
    throw new ValidationError("إجراءٌ غير معروف (approve/reject).");
  } catch (e) {
    return errorResponse(e);
  }
}
