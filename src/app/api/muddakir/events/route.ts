import { ingestEvents, type DeviceEvent } from "@/server/muddakir-events";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/muddakir/events — دفعة أحداثٍ من جهاز الحافظ (§٨). idempotent على clientEventId،
// وتُستقبل بهويّة الحافظ نفسه (يتحقّق الخادم). { events: DeviceEvent[] }.
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const body = (await req.json()) as { events?: unknown };
    if (!Array.isArray(body.events)) throw new ValidationError("events مطلوبة (مصفوفة).");
    const res = await ingestEvents({ actorUserId: actor.id, events: body.events as DeviceEvent[] });
    return Response.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
