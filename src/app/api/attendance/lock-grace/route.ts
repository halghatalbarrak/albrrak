import { Role } from "@prisma/client";
import { getLockGraceDays, setLockGraceDays } from "@/server/attendance-lock";
import { requireRoles, requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/attendance/lock-grace — مهلة القفل الحاليّة (للإدارة).
export async function GET(req: Request) {
  try {
    await requireRoles(req, ROLES);
    const graceDays = await getLockGraceDays();
    return Response.json({ graceDays });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/attendance/lock-grace — ضبط مهلة القفل. الجسم: { graceDays }.
// صلاحية ATTENDANCE_UNLOCK تُتحقَّق في الخادم.
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const b = (await req.json()) as { graceDays?: unknown };
    if (typeof b.graceDays !== "number" || !Number.isInteger(b.graceDays) || b.graceDays < 0) {
      throw new ValidationError("مهلة القفل عددٌ صحيحٌ ≥ ٠.");
    }
    await setLockGraceDays(b.graceDays, actor.id);
    return Response.json({ graceDays: b.graceDays });
  } catch (e) {
    return errorResponse(e);
  }
}
