import { MuddakirStaffRole, Role } from "@prisma/client";

import {
  createStaff,
  listUsers,
  setActive,
  setRoles,
} from "@/server/user-management";
import { setMuddakirStaffRoles } from "@/server/muddakir-requests";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// إدارة المستخدمين (المرحلة أ) — للمشرف العام والمدير التقنيّ فقط (ROLES.md).
// الحرّاس المطلقة (الوصول + التصعيد + آخر مدير تقنيّ) في طبقة الخادم (user-management.ts).
const ADMINS = [Role.SUPER_ADMIN, Role.TECH_ADMIN];

const isRoleArray = (v: unknown): v is Role[] =>
  Array.isArray(v) && v.every((r) => typeof r === "string" && (Object.values(Role) as string[]).includes(r));

const isMuddakirRoleArray = (v: unknown): v is MuddakirStaffRole[] =>
  Array.isArray(v) && v.every((r) => typeof r === "string" && (Object.values(MuddakirStaffRole) as string[]).includes(r));

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
    // أدوار المدّكر (اختياريّة) تُطبَّق بعد الإنشاء، في نفس الحفظ. فشلها لا يُلغي إنشاء الحساب.
    let muddakir: { applied: MuddakirStaffRole[]; requested: MuddakirStaffRole[] } | undefined;
    let muddakirError: string | undefined;
    if (isMuddakirRoleArray(b.muddakirRoles) && b.muddakirRoles.length > 0) {
      try { muddakir = await setMuddakirStaffRoles({ actorUserId: actor.id, targetUserId: res.userId, desired: b.muddakirRoles }); }
      catch (e) { muddakirError = e instanceof Error ? e.message : "تعذّر تعيين أدوار المدّكر."; }
    }
    return Response.json({ ...res, muddakir, muddakirError }, { status: 201 });
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
    // حفظٌ واحد للأدوار العامّة وأدوار المدّكر معاً. وظيفة المدّكر أوّلاً ليَرى setRoles الإسناد الجديد،
    // فيجوز إفراغ الأدوار العامّة إن حمل المستخدم وظيفة مدّكر (و١). فشل المدّكر يُبلَّغ صراحةً ولا يمنع
    // حفظ الأدوار العامّة. ويبقى شرط «دورٌ واحدٌ على الأقلّ من النوعين» في setRoles.
    const hasRoles = isRoleArray(b.roles);
    const hasMuddakir = isMuddakirRoleArray(b.muddakirRoles);
    if (!hasRoles && !hasMuddakir) throw new ValidationError("لا تغيير معروف (active أو roles أو muddakirRoles).");
    const out: Record<string, unknown> = {};
    if (hasMuddakir) {
      try { out.muddakir = await setMuddakirStaffRoles({ actorUserId: actor.id, targetUserId: b.userId, desired: b.muddakirRoles as MuddakirStaffRole[] }); }
      catch (e) { out.muddakirError = e instanceof Error ? e.message : "تعذّر حفظ أدوار المدّكر."; }
    }
    if (hasRoles) out.roles = (await setRoles(actor.id, b.userId, b.roles as Role[])).roles;
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
