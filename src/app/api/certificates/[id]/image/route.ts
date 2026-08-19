import { assertCanViewCertificate } from "@/server/certificate-verify";
import { ensureCertificateImage } from "@/server/certificate";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/certificates/[id]/image — يضمن الصورة (رسمٌ كسولٌ + تخزين عند أول طلب) ثمّ
// يحوّل إلى رابطها العامّ. الكادر · الطالب · وليّه فقط.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    await assertCanViewCertificate(actor.id, actor.roles, id);
    const url = await ensureCertificateImage(id);
    return Response.redirect(url, 302);
  } catch (e) {
    return errorResponse(e);
  }
}
