import { revealEmergencyContact } from "@/server/emergency";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/students/[id]/emergency — كشف جهة اتصال الطوارئ لمعلّم الطالب فقط.
// أيّ مُصادَق يمرّ الحدّ؛ الملكية (معلّم الطالب) تُتحقَّق في الخدمة ⟵ غير المعلّم 403.
// كل كشفٍ يُسجَّل سطرًا (EmergencyAccessLog). لا يظهر في قائمة ولا تصدير ولا لعريف.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const contact = await revealEmergencyContact({ actorId: actor.id, studentId: id });
    return Response.json(contact);
  } catch (e) {
    return errorResponse(e);
  }
}
