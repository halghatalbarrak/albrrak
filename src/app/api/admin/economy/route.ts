import { Role } from "@prisma/client";

import {
  createPointItem,
  listPointItems,
  setPointItemActive,
  updatePointItem,
  type PointItemInput,
} from "@/server/economy";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// إدارة بنود النقاط (م٦أ) — للإدارة وحدها. الحرّاس المطلقة في طبقة الخادم (economy.ts).
const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// نقرأ حقول البند من الجسم؛ التحقّق التفصيليّ في economy.validateItemInput.
function readItemBody(body: Record<string, unknown>): PointItemInput {
  return {
    nameAr: typeof body.nameAr === "string" ? body.nameAr : "",
    value: typeof body.value === "number" ? body.value : NaN,
    grantSource: body.grantSource as PointItemInput["grantSource"],
    limitPeriod: body.limitPeriod as PointItemInput["limitPeriod"],
    limitCount:
      body.limitCount === null || body.limitCount === undefined
        ? null
        : typeof body.limitCount === "number"
          ? body.limitCount
          : NaN,
    // نوع الحدث لبنود AUTO (م٦أ-٢) — التحقّق منه في economy.validateItemInput.
    eventType:
      typeof body.eventType === "string"
        ? (body.eventType as PointItemInput["eventType"])
        : null,
  };
}

// GET /api/admin/economy — كل البنود (المفعّلة أوّلاً).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    return Response.json({ items: await listPointItems(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/economy — إنشاء بند.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const body = (await req.json()) as Record<string, unknown>;
    const item = await createPointItem(actor.id, readItemBody(body));
    return Response.json(item, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/economy — تعديل بند، أو تعطيل/تفعيل (بحقل active وحده).
export async function PATCH(req: Request) {
  try {
    const actor = await requireRoles(req, MANAGER);
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.id !== "string") throw new ValidationError("المعرّف مطلوب.");
    if (typeof body.active === "boolean" && body.nameAr === undefined) {
      const item = await setPointItemActive(actor.id, body.id, body.active);
      return Response.json(item);
    }
    const item = await updatePointItem(actor.id, body.id, readItemBody(body));
    return Response.json(item);
  } catch (e) {
    return errorResponse(e);
  }
}
