import { Role } from "@prisma/client";
import {
  acceptApplication,
  rejectApplication,
  waitlistApplication,
} from "@/server/application";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/applications/[id]/decision — القبول/الرفض/الانتظار (المدير فقط).
// كل قرار يمرّ عبر دالّة خدمة. غير المخوّل ← 403.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRoles(req, [
      Role.CIRCLE_MANAGER,
      Role.SUPER_ADMIN,
    ]);
    const { id } = await ctx.params;
    const body = (await req.json()) as { decision?: string; note?: string };

    switch (body.decision) {
      case "accept": {
        const r = await acceptApplication({
          applicationId: id,
          decidedBy: actor.id,
        });
        return Response.json(r);
      }
      case "reject": {
        const r = await rejectApplication({
          applicationId: id,
          decidedBy: actor.id,
          note: body.note ?? "",
        });
        return Response.json({ id: r.id, status: r.status });
      }
      case "waitlist": {
        const r = await waitlistApplication({
          applicationId: id,
          decidedBy: actor.id,
        });
        return Response.json({ id: r.id, status: r.status });
      }
      default:
        throw new ValidationError("قرار غير معروف (accept | reject | waitlist).");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
