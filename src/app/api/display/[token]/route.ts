import { getPublicScreen } from "@/server/display/public";

// GET /api/display/[token] — قراءةٌ عامّةٌ بلا دخول (وضع التلفاز). لا تكشف معرّفاتٍ داخليّة.
// الرمز غير الموجود/الملغى ⟵ 404 عامّ؛ وتجاوز الحدّ ⟵ 429.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "0";
    const r = await getPublicScreen(token, ip);
    if (!r.ok) return Response.json({ error: "غير متاح" }, { status: r.status });
    return Response.json(r.data);
  } catch (e) {
    console.error("[display] public read error:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "غير متاح" }, { status: 404 });
  }
}
