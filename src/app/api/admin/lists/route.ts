import { Role } from "@prisma/client";
import {
  addReferenceValue,
  isListKind,
  listAllReferenceValues,
  setReferenceValueActive,
} from "@/server/list-values";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/admin/lists — كل القيم المرجعية (بما فيها المعطَّلة) لشاشة إدارة القوائم.
export async function GET(req: Request) {
  try {
    await requireRoles(req, MANAGER);
    return Response.json(await listAllReferenceValues());
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/lists — إضافة قيمة { kind, nameAr }.
export async function POST(req: Request) {
  try {
    await requireRoles(req, MANAGER);
    const body = (await req.json()) as { kind?: unknown; nameAr?: unknown };
    if (!isListKind(body.kind)) throw new ValidationError("نوع قائمة غير معروف.");
    if (typeof body.nameAr !== "string") throw new ValidationError("الاسم مطلوب.");
    const item = await addReferenceValue({ kind: body.kind, nameAr: body.nameAr });
    return Response.json(item, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/lists — تعطيل/تفعيل قيمة { kind, id, isActive } (لا حذف).
export async function PATCH(req: Request) {
  try {
    await requireRoles(req, MANAGER);
    const body = (await req.json()) as { kind?: unknown; id?: unknown; isActive?: unknown };
    if (!isListKind(body.kind)) throw new ValidationError("نوع قائمة غير معروف.");
    if (typeof body.id !== "string") throw new ValidationError("المعرّف مطلوب.");
    if (typeof body.isActive !== "boolean") throw new ValidationError("الحالة مطلوبة.");
    const item = await setReferenceValueActive({
      kind: body.kind,
      id: body.id,
      isActive: body.isActive,
    });
    return Response.json(item);
  } catch (e) {
    return errorResponse(e);
  }
}
