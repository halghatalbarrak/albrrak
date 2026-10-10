import { MotivationKind, Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { listBadgeDefinitions } from "@/server/gamification/badges";
import { listMotivationTemplates, updateBadgeDefinition, updateMotivationTemplate } from "@/server/gamification/admin";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ADMIN: Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// GET /api/admin/gamification — تعريفات الأوسمة وقوالب التحفيز (لمدير المنصّة).
export async function GET(req: Request) {
  try {
    await requireRoles(req, ADMIN);
    const [badges, templates] = await Promise.all([listBadgeDefinitions(), listMotivationTemplates()]);
    return Response.json({ badges, templates });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/gamification — { action:"badge", id, patch } أو { action:"template", kind, patch }.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ADMIN);
    const b = (await req.json()) as { action?: unknown; id?: unknown; kind?: unknown; patch?: Record<string, unknown> };
    if (b.action === "badge") {
      if (typeof b.id !== "string") throw new ValidationError("التعريف مطلوب.");
      await updateBadgeDefinition(actor.id, b.id, (b.patch ?? {}) as never);
      return Response.json({ ok: true });
    }
    if (b.action === "template") {
      if (typeof b.kind !== "string" || !(Object.values(MotivationKind) as string[]).includes(b.kind)) throw new ValidationError("نوع القالب مطلوب.");
      await updateMotivationTemplate(actor.id, b.kind as MotivationKind, (b.patch ?? {}) as { textAr?: string; active?: boolean });
      return Response.json({ ok: true });
    }
    throw new ValidationError("الإجراء مطلوب (badge/template).");
  } catch (e) {
    return errorResponse(e);
  }
}
