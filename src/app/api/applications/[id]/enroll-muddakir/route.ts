import { MuddakirDeliveryMode, Role } from "@prisma/client";
import { acceptApplication } from "@/server/application";
import { enrollInMuddakir } from "@/server/muddakir-enrollment";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/applications/[id]/enroll-muddakir
// يقبل الطلب ويُلحق الطالب بالمُدَّكِر في خطوةٍ واحدة (المدير فقط).
// Body: { circleId, track?, supervisorId?, deliveryMode? }
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      circleId?: string;
      track?: number;
      supervisorId?: string;
      deliveryMode?: string;
    };

    const accepted = await acceptApplication({ applicationId: id, decidedBy: actor.id });

    await enrollInMuddakir({
      studentId: accepted.studentId,
      actorId: actor.id,
      circleId: body.circleId,
      track: typeof body.track === "number" ? body.track : undefined,
      supervisorId: body.supervisorId ?? undefined,
      deliveryMode:
        body.deliveryMode === MuddakirDeliveryMode.REMOTE
          ? MuddakirDeliveryMode.REMOTE
          : MuddakirDeliveryMode.IN_PERSON,
    });

    return Response.json({ studentId: accepted.studentId });
  } catch (e) {
    return errorResponse(e);
  }
}
