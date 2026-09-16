import { Role } from "@prisma/client";

import {
  createMarketItem,
  listMarketItems,
  setMarketItemActive,
  updateMarketItem,
  type MarketItemInput,
} from "@/server/market";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// إدارة السلع (م٦ب) — للإدارة وحدها (كإدارة بنود م٦أ). الحرّاس المطلقة في market.ts.
const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// نقرأ حقول السلعة من الجسم؛ التحقّق التفصيليّ في market.validateItemInput.
function readItemBody(body: Record<string, unknown>): MarketItemInput {
  return {
    nameAr: typeof body.nameAr === "string" ? body.nameAr : "",
    pricePoints: typeof body.pricePoints === "number" ? body.pricePoints : NaN,
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
    stock:
      body.stock === null || body.stock === undefined
        ? null
        : typeof body.stock === "number"
          ? body.stock
          : NaN,
  };
}

// GET /api/admin/market — كل السلع (المفعّلة أوّلًا).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    return Response.json({ items: await listMarketItems(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/market — إنشاء سلعة.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const body = (await req.json()) as Record<string, unknown>;
    const item = await createMarketItem(actor.id, readItemBody(body));
    return Response.json(item, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/market — تعديل سلعة، أو تعطيل/تفعيل (بحقل active وحده).
export async function PATCH(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.id !== "string") throw new ValidationError("المعرّف مطلوب.");
    if (typeof body.active === "boolean" && body.nameAr === undefined) {
      const item = await setMarketItemActive(actor.id, body.id, body.active);
      return Response.json(item);
    }
    const item = await updateMarketItem(actor.id, body.id, readItemBody(body));
    return Response.json(item);
  } catch (e) {
    return errorResponse(e);
  }
}
