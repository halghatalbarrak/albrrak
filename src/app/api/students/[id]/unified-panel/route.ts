import { Role } from "@prisma/client";
import { getStudentPanelDetail } from "@/server/unified-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";
import { makeTimer } from "@/lib/timing";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/students/[id]/unified-panel?date=YYYY-MM-DD&program=MARAQI|...
// تفاصيل بطاقة الطالب (today + qaidah + bounds مُثرَاة بـsessionId/errors).
// تُستدعى مرّةً واحدة عند فتح البطاقة وتُخزَّن محليّاً حتى تتغيّر.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = makeTimer();
  try {
    const actor = await requireRoles(req, ROLES);
    t.endAuth();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) throw verr("dateRequired");
    const program = url.searchParams.get("program") ?? null;
    const detail = await getStudentPanelDetail(actor.id, id, program, date);
    t.endDb();
    t.log("/api/students/[id]/unified-panel");
    return new Response(JSON.stringify(detail), {
      headers: { "Content-Type": "application/json", "Server-Timing": t.header() },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
