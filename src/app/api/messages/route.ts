import { getGuardianInbox, markMessageRead } from "@/server/guardian-messages";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/messages — صندوق وليّ الأمر (رسائل طلابه فقط). قراءةٌ فقط.
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    return Response.json({ messages: await getGuardianInbox(actor.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/messages — تعليم رسالةٍ مقروءة { id }. للوليّ صاحبها فقط (يُتحقَّق في الخادم).
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const b = (await req.json()) as { id?: unknown };
    if (typeof b.id === "string") await markMessageRead(b.id, actor.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
