import { addGuardianGift } from "@/server/market";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/market/gifts — وليّ الأمر يضيف ثمرةً (م٦ب-٢): تبدأ PENDING بقيمةٍ مقترحة.
// الحرّاس المطلقة في market.addGuardianGift (GUARDIAN وحده، ولأبنائه المرتبطين فقط).
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.nameAr !== "string") throw new ValidationError("اسم الثمرة مطلوب.");
    if (typeof body.proposedPricePoints !== "number") throw new ValidationError("القيمة المقترحة مطلوبة.");
    const item = await addGuardianGift(actor.id, {
      nameAr: body.nameAr,
      proposedPricePoints: body.proposedPricePoints,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
      targetStudentId: typeof body.targetStudentId === "string" ? body.targetStudentId : null,
    });
    return Response.json({ id: item.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
