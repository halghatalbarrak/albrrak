import { recordExtra } from "@/server/unified-session";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

// POST /api/students/[id]/extra — مكافأة الإنجاز الزائد (الشاشة الموحّدة). الجسم: { kind, date }.
// requireAuth فقط: الحارس في الخادم (معلّم الحلقة/العريف) يفصل الصلاحية. يُطلق *_EXTRA بالوحدة التالية.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    const { id } = await ctx.params;
    const b = (await req.json()) as { kind?: unknown; date?: unknown };
    if (b.kind !== "hifz" && b.kind !== "tarseekh" && b.kind !== "murajaah") throw verr("unknownRaiseType");
    if (typeof b.date !== "string") throw verr("dateRequired");
    const res = await recordExtra({ studentId: id, actorId: actor.id, kind: b.kind, date: b.date });
    return Response.json(res, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
