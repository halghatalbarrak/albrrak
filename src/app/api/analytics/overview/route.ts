import { Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { getAnalyticsOverview, type AnalyticsPeriod } from "@/server/analytics-overview";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

const ALLOWED: Role[] = [
  Role.SUPER_ADMIN,
  Role.TECH_ADMIN,
  Role.CIRCLE_MANAGER,
  Role.TEACHER,
  Role.DONOR,
];

export async function GET(req: Request): Promise<Response> {
  try {
    const actor = await requireRoles(req, ALLOWED);
    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get("period") ?? "week";
    const period: AnalyticsPeriod = ["day", "week", "month"].includes(rawPeriod)
      ? (rawPeriod as AnalyticsPeriod)
      : "week";
    const data = await getAnalyticsOverview(actor.roles, actor.id, period);
    const headers: Record<string, string> = period === "month"
      ? { "Cache-Control": "private, max-age=600" }
      : { "Cache-Control": "private, no-store" };
    return Response.json(data, { headers });
  } catch (e) {
    return errorResponse(e);
  }
}
