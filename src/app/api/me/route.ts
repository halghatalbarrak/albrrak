import { getMyPage } from "@/server/me";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/me — صفحة المستخدم عن نفسه. أيّ مُصادَق فعّال. بلا رقم هوية.
// أثناء الانتحال: الاسم/الأدوار = المنتحَل (الهويّة الفعليّة)، مع علامة impersonating للشريط.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    const page = await getMyPage(actor.id);
    return Response.json({ ...page, impersonating: actor.impersonating });
  } catch (e) {
    return errorResponse(e);
  }
}
