import { Role } from "@prisma/client";
import { listStudentsSafe } from "@/server/students";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/students — كشفٌ للكادر. رقم الهوية **غير موجود في الرد أصلاً** (م٥)،
// لا محجوبٌ في الواجهة. من يحتاجه يمرّ عبر مسارٍ مخوّل مُسجَّل.
export async function GET(req: Request) {
  try {
    await requireRoles(req, [
      Role.SUPER_ADMIN,
      Role.CIRCLE_MANAGER,
      Role.REGISTRAR,
      Role.TEACHER,
    ]);
    const students = await listStudentsSafe();
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
