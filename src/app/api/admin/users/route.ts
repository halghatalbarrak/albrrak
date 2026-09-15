import { Role } from "@prisma/client";

import {
  createStaff,
  listUsers,
  setActive,
  setRoles,
} from "@/server/user-management";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// إدارة المستخدمين (المرحلة أ) — للمشرف العام والمدير التقنيّ فقط (ROLES.md).
// الحرّاس المطلقة (الوصول + التصعيد + آخر مدير تقنيّ) في طبقة الخادم (user-management.ts).
const ADMINS = [Role.SUPER_ADMIN, Role.TECH_ADMIN];

const isRoleArray = (v: unknown): v is Role[] =>
  Array.isArray(v) && v.every((r) => typeof r === "string" && (Object.values(Role) as string[]).includes(r));

// GET /api/admin/users — كل المستخدمين.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, ADMINS);
    return Response.json({ users: await listUsers(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/users — إضافة كادر ⟵ يعيد رابط التفعيل.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ADMINS);
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.name !== "string") throw new ValidationError("الاسم مطلوب.");
    if (typeof b.phone !== "string") throw new ValidationError("الجوال مطلوب.");
    if (!isRoleArray(b.roles)) throw new ValidationError("الأدوار مطلوبة.");
    const res = await createStaff(actor.id, { name: b.name, phone: b.phone, roles: b.roles });
    return Response.json(res, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/users — تعطيل/تفعيل (active) أو تعديل الأدوار (roles).
export async function PATCH(req: Request) {
  try {
    const actor = await requireRoles(req, ADMINS);
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.userId !== "string") throw new ValidationError("المعرّف مطلوب.");
    if (typeof b.active === "boolean") {
      return Response.json(await setActive(actor.id, b.userId, b.active));
    }
    if (isRoleArray(b.roles)) {
      return Response.json(await setRoles(actor.id, b.userId, b.roles));
    }
    throw new ValidationError("لا تغيير معروف (active أو roles).");
  } catch (e) {
    return errorResponse(e);
  }
}
