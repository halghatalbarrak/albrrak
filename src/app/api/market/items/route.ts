import { Role } from "@prisma/client";

import { listSellableItems, listSellableItemsForStudent } from "@/server/market";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/market/items            → الثمرات العامّة المعتمَدة (قبل تحديد الطالب).
// GET /api/market/items?studentId= → بيدر ذلك الطالب (العامّة + الموجَّهة إليه). للبائع.
// م٦ب-٢: بعد مسح الرمز، يُمرّر البائع studentId ليرى ما يحقّ لهذا الطالب جَنْيُه.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.SELLER]);
    const studentId = new URL(req.url).searchParams.get("studentId");
    const items = studentId
      ? await listSellableItemsForStudent(actor.id, studentId)
      : await listSellableItems(actor.id);
    return Response.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
