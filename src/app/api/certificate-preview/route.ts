import { buildCertificateHtml } from "@/server/certificate";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { Role } from "@prisma/client";

// معاينةُ تصميم الشهادة (بياناتٌ نموذجيّة فقط، لا شهادةٌ حقيقيّة) — للمدير التقنيّ وحده.
export async function GET(req: Request) {
  try {
    await requireRoles(req, [Role.SUPER_ADMIN]);
    const html = await buildCertificateHtml({
      recipientName: "محمد عبدالله القحطاني",
      template: "KHATM",
      isExcellent: true,
      token: "K7F29QX4-M3T8-VR51",
      verifyUrl: "https://halaqat-albarrak.com/verify/SAMPLE",
      issuedAtIso: "2026-08-19",
      brand: "حلقات الشيخ محمد البراك",
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return errorResponse(e);
  }
}
