import { getPublicCertificate } from "@/server/certificate-verify";
import { errorResponse } from "@/server/http";

// GET /api/verify/[token] — تحقّقٌ عامّ (بلا مصادقة). يكشف الحدّ الأدنى فقط.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const cert = await getPublicCertificate(token);
    return Response.json(cert ?? { valid: false, revoked: false, unknown: true });
  } catch (e) {
    return errorResponse(e);
  }
}
