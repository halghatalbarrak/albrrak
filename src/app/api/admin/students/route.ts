import { Role } from "@prisma/client";
import { listStudentsForAdmin } from "@/server/students";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/admin/students — قائمة الطلاب المقبولين للكادر الإداري.
// بلا رقم هوية وبلا جوال طوارئ (م٥ ونمطه). كلٌّ منهما بمسارٍ مخوّل مُسجَّل.
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.REGISTRAR]);
    const students = await listStudentsForAdmin();
    return Response.json({ students });
  } catch (e) {
    return errorResponse(e);
  }
}
