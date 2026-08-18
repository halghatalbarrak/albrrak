import { generateWeeklyMessages, weekStartSunday } from "@/server/guardian-messages";
import { errorResponse } from "@/server/http";

// GET /api/cron/weekly-reports — كرونٌ يوميّ (Vercel) يفحص «أهو الخميس بتوقيت المدينة؟»
// ثم يولّد تقارير الأسبوع. مؤمَّنٌ بـCRON_SECRET (يرسله Vercel في الترويسة). قراءةٌ/توليد.

function riyadhToday(): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday") };
}

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return Response.json({ error: "CRON_SECRET غير مضبوط — الكرون معطَّل." }, { status: 503 });
    if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return new Response("forbidden", { status: 401 });

    const { date, weekday } = riyadhToday();
    if (weekday !== "Thu") return Response.json({ skipped: true, weekday }); // يُرسَل الخميس فقط
    const weekStart = weekStartSunday(date);
    const created = await generateWeeklyMessages(weekStart);
    return Response.json({ created, weekStart: weekStart.toISOString().slice(0, 10) });
  } catch (e) {
    return errorResponse(e);
  }
}
