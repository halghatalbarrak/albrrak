import { buildCertificateHtml } from "@/server/certificate";
import { errorResponse } from "@/server/http";

// معاينةُ تصميم الشهادة (بياناتٌ نموذجيّة فقط، لا شهادةٌ حقيقيّة) — لعرض التصميم على محمد.
export async function GET() {
  try {
    const html = await buildCertificateHtml({
      recipientName: "محمد عبدالله القحطاني",
      template: "KHATM",
      isExcellent: true,
      token: "K7F29QX4-M3T8-VR51",
      verifyUrl: "https://albrrak.vercel.app/verify/SAMPLE",
      issuedAtIso: "2026-08-19",
      brand: "حلقات الشيخ محمد البراك",
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return errorResponse(e);
  }
}
