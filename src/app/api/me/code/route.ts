import QRCode from "qrcode";

import { requestStudentCode } from "@/server/market";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// POST /api/me/code — يطلب كودَ الطالب المتغيّر (نفسه، أو وليّه بتمرير studentId).
// يعيد الكود + رقمَه الاحتياطيّ + صورةَ QR (حمولتُها الكودُ نفسه) + وقت الانتهاء.
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const studentId = typeof body.studentId === "string" ? body.studentId : undefined;
    const issued = await requestStudentCode(actor.id, studentId);
    const qrDataUrl = await QRCode.toDataURL(issued.code, {
      margin: 1,
      width: 240,
      color: { dark: "#463D34", light: "#FFFFFF" },
    });
    return Response.json({ code: issued.code, qrDataUrl, expiresAt: issued.expiresAt });
  } catch (e) {
    return errorResponse(e);
  }
}
