import { listGuardedStudents } from "@/server/market";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me/guarded — أبناء المستخدم (روابط ولايةٍ نشطة) لإظهار كود كلٍّ منهم.
// دون ١٣ لا حساب له (م٤)، فوليّه يُظهر كودَه من هنا. [] إن لم يكن وليًّا.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json({ students: await listGuardedStudents(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
