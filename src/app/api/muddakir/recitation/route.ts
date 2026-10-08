import { Role } from "@prisma/client";

import { listRecitationCandidates, recordRecitation, type RecitationErrorInput } from "@/server/muddakir-stages";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.RECITER, Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// GET /api/muddakir/recitation — الحفّاظ الجاهزون للسرد ممّن يجوز لهذا المختبِر اختبارهم.
export async function GET(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    return Response.json({ candidates: await listRecitationCandidates(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/muddakir/recitation — تسجيل نتيجة السرد ومواضع الأخطاء. { studentId, passed, errors? }.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ROLES);
    const b = (await req.json()) as { studentId?: unknown; passed?: unknown; errors?: unknown };
    if (typeof b.studentId !== "string") throw new ValidationError("الحافظ مطلوب.");
    if (typeof b.passed !== "boolean") throw new ValidationError("النتيجة مطلوبة.");
    const errors: RecitationErrorInput[] = Array.isArray(b.errors)
      ? b.errors.filter((e): e is RecitationErrorInput => !!e && typeof (e as RecitationErrorInput).page === "number" && typeof (e as RecitationErrorInput).lineNo === "number")
      : [];
    return Response.json(await recordRecitation({ examinerUserId: actor.id, studentId: b.studentId, passed: b.passed, errors }));
  } catch (e) {
    return errorResponse(e);
  }
}
