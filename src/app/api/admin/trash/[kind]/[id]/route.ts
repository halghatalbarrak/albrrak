import { Role } from "@prisma/client";
import { type TrashKind, restoreItem, hardDeleteItem } from "@/server/trash";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

const MANAGERS = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];
const SUPER_ONLY = [Role.SUPER_ADMIN];

function parseKind(k: string): TrashKind | null {
  if (k === "user" || k === "circle" || k === "student") return k;
  return null;
}

// POST /api/admin/trash/[kind]/[id] — استعادة
export async function POST(
  req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
): Promise<Response> {
  try {
    const actor = await requireRoles(req, MANAGERS);
    const { kind: kindRaw, id } = await ctx.params;
    const kind = parseKind(kindRaw);
    if (!kind) return Response.json({ error: "نوع غير صالح" }, { status: 400 });
    await restoreItem(actor.id, kind, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE /api/admin/trash/[kind]/[id] — حذف دائم (SUPER_ADMIN فقط)
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
): Promise<Response> {
  try {
    const actor = await requireRoles(req, SUPER_ONLY);
    const { kind: kindRaw, id } = await ctx.params;
    const kind = parseKind(kindRaw);
    if (!kind) return Response.json({ error: "نوع غير صالح" }, { status: 400 });
    await hardDeleteItem(actor.id, kind, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
