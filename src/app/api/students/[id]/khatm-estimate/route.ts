import { Role } from "@prisma/client";

import { assertGuardianOwnsStudent, estimateKhatmDate } from "@/server/estimate-khatm";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.TEACHER, Role.REGISTRAR];
const ALL_ROLES: Role[] = [...ADMIN_ROLES, Role.GUARDIAN, Role.DONOR, Role.STUDENT];

// GET /api/students/[id]/khatm-estimate
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ALL_ROLES);
    const { id } = await ctx.params;

    const isAdmin = actor.roles.some((r) => (ADMIN_ROLES as string[]).includes(r));

    // ولي الأمر: يتحقّق من ملكيّته للطالب (IDOR)
    if (actor.roles.includes(Role.GUARDIAN) && !isAdmin) {
      await assertGuardianOwnsStudent(actor.id, id);
    }

    const result = await estimateKhatmDate(id);

    // المانح: يرى أياماً تقريبيّة بلا تاريخ دقيق
    if (actor.roles.includes(Role.DONOR) && !isAdmin) {
      if (result.kind === "DATE") {
        const daysRemaining = Math.ceil(
          (result.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        return Response.json({ kind: "DAYS_APPROX", daysRemaining });
      }
      return Response.json({ kind: result.kind });
    }

    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
