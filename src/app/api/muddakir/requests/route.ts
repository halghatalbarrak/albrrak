import { requireMuddakir } from "@/server/muddakir-staff";
import { cancelRequest, decideRequest, listMyRequests, listPendingRequests } from "@/server/muddakir-requests";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

// GET /api/muddakir/requests — صندوق المدير (المعلّقة) إن كان مديراً، وطلبات الفاعل نفسه دائماً.
// (الإداريّ يرى طلباته فقط؛ المدير يرى الصندوق وطلباته.)
export async function GET(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    const [pending, mine] = await Promise.all([
      actor.caps.manage ? listPendingRequests() : Promise.resolve([]),
      listMyRequests(actor.id),
    ]);
    return Response.json({ canManage: actor.caps.manage, pending, mine });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/muddakir/requests — المدير يبتّ { action:"decide", requestId, decision, reason? }؛
// الإداريّ يلغي { action:"cancel", requestId }.
export async function POST(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    const b = (await req.json()) as { action?: unknown; requestId?: unknown; decision?: unknown; reason?: unknown };
    if (typeof b.requestId !== "string") throw verr("requestRequired");
    if (b.action === "cancel") return Response.json(await cancelRequest({ actorUserId: actor.id, requestId: b.requestId }));
    if (b.action === "decide") {
      if (b.decision !== "APPROVED" && b.decision !== "REJECTED") throw verr("decisionRequired");
      return Response.json(await decideRequest({ actorUserId: actor.id, requestId: b.requestId, decision: b.decision, reason: typeof b.reason === "string" ? b.reason : undefined }));
    }
    throw verr("actionRequiredDecideCancel");
  } catch (e) {
    return errorResponse(e);
  }
}
