import { MuddakirStaffRole, Role } from "@prisma/client";

import { updateUser, softDeleteUser, setActive, setRoles, setRolesAndStaff } from "@/server/user-management";
import { setMuddakirStaffRoles } from "@/server/muddakir-requests";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

const ADMINS = [Role.SUPER_ADMIN, Role.TECH_ADMIN];

const isRoleArray = (v: unknown): v is Role[] =>
  Array.isArray(v) && v.every((r) => typeof r === "string" && (Object.values(Role) as string[]).includes(r));

const isMuddakirRoleArray = (v: unknown): v is MuddakirStaffRole[] =>
  Array.isArray(v) && v.every((r) => typeof r === "string" && (Object.values(MuddakirStaffRole) as string[]).includes(r));

// PATCH /api/admin/users/[id] — تعديل الاسم والجوال والأدوار والحالة.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ADMINS);
    const { id: userId } = await params;
    if (!userId) throw verr("idRequired");
    const b = (await req.json()) as Record<string, unknown>;

    const out: Record<string, unknown> = {};

    // تعديل الاسم والجوال
    const hasName = typeof b.name === "string";
    const hasPhone = typeof b.phone === "string";
    if (hasName || hasPhone) {
      await updateUser(actor.id, userId, {
        name: hasName ? (b.name as string) : undefined,
        phone: hasPhone ? (b.phone as string) : undefined,
      });
      out.updated = true;
    }

    // تعديل الأدوار
    const hasRoles = isRoleArray(b.roles);
    const hasMuddakir = isMuddakirRoleArray(b.muddakirRoles);
    if (hasRoles && hasMuddakir) {
      const r = await setRolesAndStaff(actor.id, userId, b.roles as Role[], b.muddakirRoles as MuddakirStaffRole[]);
      out.roles = r.roles;
      out.muddakir = { applied: r.muddakirApplied, requested: [] };
    } else if (hasRoles) {
      out.roles = (await setRoles(actor.id, userId, b.roles as Role[])).roles;
    } else if (hasMuddakir) {
      try {
        out.muddakir = await setMuddakirStaffRoles({ actorUserId: actor.id, targetUserId: userId, desired: b.muddakirRoles as MuddakirStaffRole[] });
      } catch (e) {
        out.muddakirError = e instanceof Error ? e.message : "تعذّر حفظ أدوار المدّكر.";
      }
    }

    // تعديل الحالة
    if (typeof b.isActive === "boolean") {
      await setActive(actor.id, userId, b.isActive);
      out.isActive = b.isActive;
    }

    if (!hasName && !hasPhone && !hasRoles && !hasMuddakir && b.isActive === undefined) {
      throw verr("unknownUserChange");
    }

    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE /api/admin/users/[id] — حذف ناعم.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ADMINS);
    const { id: userId } = await params;
    if (!userId) throw verr("idRequired");
    await softDeleteUser(actor.id, userId);
    return Response.json({ deleted: true });
  } catch (e) {
    return errorResponse(e);
  }
}
