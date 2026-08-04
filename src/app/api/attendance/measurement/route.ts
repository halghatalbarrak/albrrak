import { Role } from "@prisma/client";
import { getChapterMeasurement } from "@/server/attendance";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// GET /api/attendance/measurement?stageId=... — قياس بابٍ بوسيط الأقران بلا حكم (§١١).
// التنبيه على الشريحة العليا معطَّلٌ حتى ٢٠ إتمامًا (alertsEnabled).
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const stageId = new URL(req.url).searchParams.get("stageId");
    if (!stageId) throw new ValidationError("المرحلة مطلوبة.");
    const measurement = await getChapterMeasurement(stageId);
    return Response.json(measurement);
  } catch (e) {
    return errorResponse(e);
  }
}
