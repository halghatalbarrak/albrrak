import { listRegistrationOptions } from "@/server/registration-options";
import { errorResponse } from "@/server/http";

// GET /api/registration-options — قوائم نموذج القيد العام (بلا مصادقة، بيانات مرجعية).
export async function GET() {
  try {
    return Response.json(await listRegistrationOptions());
  } catch (e) {
    return errorResponse(e);
  }
}
