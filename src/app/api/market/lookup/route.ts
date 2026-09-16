import { Role } from "@prisma/client";

import { lookupStudentByCode } from "@/server/market";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// GET /api/market/lookup?code=XXXXXX — بطاقة الطالب (اسم + رصيد فقط). للبائع وحده.
// لا سجلّ تعليميّ (خصوصيّة الطالب — DESIGN §٢/§٤).
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.SELLER]);
    const code = new URL(req.url).searchParams.get("code");
    if (!code) throw new ValidationError("أدخل الكود.");
    return Response.json(await lookupStudentByCode(actor.id, code));
  } catch (e) {
    return errorResponse(e);
  }
}
