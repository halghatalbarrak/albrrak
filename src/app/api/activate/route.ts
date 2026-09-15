import { completeActivation, getActivationStatus } from "@/server/user-management";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// مسار التفعيل العامّ — **بلا تسجيل دخول**. الرمز نفسه هو الإثبات (عشوائيّ قويّ، لمرّةٍ واحدة).

// GET /api/activate?token=… — هل الرمز صالح؟ (يرمي 400 برسالةٍ عربيّة إن لا).
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) throw new ValidationError("لا رمز.");
    return Response.json(await getActivationStatus(token));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/activate — { token, password } ⟵ يضبط كلمة السرّ ويبطل الرابط.
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.token !== "string") throw new ValidationError("لا رمز.");
    if (typeof b.password !== "string") throw new ValidationError("كلمة السرّ مطلوبة.");
    await completeActivation(b.token, b.password);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
