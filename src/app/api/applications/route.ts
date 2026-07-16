import { Role } from "@prisma/client";
import {
  listApplicationsForReview,
  submitApplication,
} from "@/server/application";
import { parseApplicationInput } from "@/server/validation";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/applications — نموذج القيد العام: بلا مصادقة، بلا anon insert.
// يمرّ عبر دالّة الخدمة (submitApplication) التي تُشفّر الهوية قبل القاعدة.
export async function POST(req: Request) {
  try {
    const input = parseApplicationInput(await req.json());
    const app = await submitApplication(input);
    return Response.json({ id: app.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

// GET /api/applications — قائمة المراجعة للمدير (بلا رقم الهوية).
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const applications = await listApplicationsForReview();
    return Response.json({ applications });
  } catch (e) {
    return errorResponse(e);
  }
}
