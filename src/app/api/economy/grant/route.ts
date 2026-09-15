import { Role } from "@prisma/client";

import {
  getLedgerForActor,
  grantPoints,
  listGrantableItems,
  listGrantableStudents,
} from "@/server/economy";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// منح النقاط (م٦أ): المعلّم والإدارة. الحرّاس المطلقة (مصدر البند + نطاق الطالب + الحدّ)
// في طبقة الخادم (economy.ts) — الواجهة تعرض المسموح فقط، والخادم يرفض ما عداه.
const GRANTERS = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/economy/grant           → { items, students } (المسموح للفاعل منحها)
// GET /api/economy/grant?studentId → دفتر ذلك الطالب (بحسب نطاق الفاعل)
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, GRANTERS);
    const studentId = new URL(req.url).searchParams.get("studentId");
    if (studentId) {
      return Response.json(await getLedgerForActor(actor.id, studentId));
    }
    const [items, students] = await Promise.all([
      listGrantableItems(actor.id),
      listGrantableStudents(actor.id),
    ]);
    return Response.json({ items, students });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/economy/grant — منح بندٍ لطالب.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, GRANTERS);
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.studentId !== "string") throw new ValidationError("الطالب مطلوب.");
    if (typeof body.pointItemId !== "string") throw new ValidationError("البند مطلوب.");
    const txn = await grantPoints({
      studentId: body.studentId,
      pointItemId: body.pointItemId,
      grantedBy: actor.id,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return Response.json(txn, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
