import { Role } from "@prisma/client";
import { listTracksAdmin, setTrackActive, unitsForTrack } from "@/server/track-units";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/admin/tracks            → المسارات الثمانية (بمقدارها وعدد وحداتها)
// GET /api/admin/tracks?trackId=X  → وحدات مسارٍ بعينه (unitNo + الحدود سورة:آية)
export async function GET(req: Request) {
  try {
    await requireRoles(req, MANAGER);
    const trackId = new URL(req.url).searchParams.get("trackId");
    if (trackId) return Response.json({ units: await unitsForTrack(trackId) });
    return Response.json({ tracks: await listTracksAdmin() });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/tracks — تفعيل/تعطيل مسار { trackId, isActive }.
export async function PATCH(req: Request) {
  try {
    await requireRoles(req, MANAGER);
    const b = (await req.json()) as { trackId?: unknown; isActive?: unknown };
    if (typeof b.trackId !== "string") throw new ValidationError("المسار مطلوب.");
    if (typeof b.isActive !== "boolean") throw new ValidationError("الحالة مطلوبة.");
    await setTrackActive(b.trackId, b.isActive);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
