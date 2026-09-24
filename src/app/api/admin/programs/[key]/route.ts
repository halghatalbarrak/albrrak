import { ProgramKey, Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { getProgramSettings, setProgramTransition } from "@/server/placement-actions";
import { ValidationError } from "@/server/errors";
import { errorResponse } from "@/server/http";

// إعدادات انتقال البرنامج (ق٤/ق٥): البرنامج التالي + المسار الافتراضيّ للمنتقلين.
const ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.TECH_ADMIN];

function toKey(raw: string): ProgramKey {
  if (!(raw in ProgramKey)) throw new ValidationError("برنامج غير معروف.");
  return ProgramKey[raw as keyof typeof ProgramKey];
}

// GET → إعدادات البرنامج الحاليّة + خيارات البرامج والمسارات (لملء نموذج الإعدادات).
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { key } = await ctx.params;
    return Response.json(await getProgramSettings(actor.id, toKey(key)));
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH { nextProgramId, defaultTrackForIncomingId } → حفظ الإعدادات.
export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { key } = await ctx.params;
    const b = (await req.json()) as { nextProgramId?: unknown; defaultTrackForIncomingId?: unknown };
    await setProgramTransition({
      actorId: actor.id,
      programKey: toKey(key),
      nextProgramId: typeof b.nextProgramId === "string" && b.nextProgramId ? b.nextProgramId : null,
      defaultTrackForIncomingId: typeof b.defaultTrackForIncomingId === "string" && b.defaultTrackForIncomingId ? b.defaultTrackForIncomingId : null,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
