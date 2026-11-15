import { completeActivation, getActivationStatus, checkActivateRateLimit } from "@/server/user-management";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

// مسار التفعيل العامّ — **بلا تسجيل دخول**. الرمز نفسه هو الإثبات (عشوائيّ قويّ، لمرّةٍ واحدة).

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "0";
}

// GET /api/activate?token=… — هل الرمز صالح؟ (يرمي 400 برسالةٍ عربيّة إن لا).
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) throw verr("activateNoToken");
    return Response.json(await getActivationStatus(token));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/activate — { token, password } ⟵ يضبط كلمة السرّ ويبطل الرابط.
export async function POST(req: Request) {
  try {
    if (!(await checkActivateRateLimit(clientIp(req)))) {
      return Response.json({ error: "طلباتٌ كثيرةٌ — انتظر دقيقةً ثمّ أعِد المحاولة." }, { status: 429 });
    }
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.token !== "string") throw verr("activateNoToken");
    if (typeof b.password !== "string") throw verr("passwordRequired");
    await completeActivation(b.token, b.password);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
