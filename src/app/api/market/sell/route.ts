import { Role } from "@prisma/client";

import { sellToStudentByCode } from "@/server/market";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/market/sell — بيع سلعةٍ لطالبٍ بكوده. للبائع وحده. البائع لا يُدخل السعر.
// القواعد المطلقة (كود صالح/رصيد/تفعيل/مخزون) ذرّيّةٌ في الخادم (market.sellToStudentByCode).
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.SELLER]);
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.code !== "string") throw new ValidationError("الكود مطلوب.");
    if (typeof body.marketItemId !== "string") throw new ValidationError("السلعة مطلوبة.");
    const result = await sellToStudentByCode({
      sellerUserId: actor.id,
      code: body.code,
      marketItemId: body.marketItemId,
    });
    return Response.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
