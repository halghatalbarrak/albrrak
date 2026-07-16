import { type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "./errors";

export interface Actor {
  id: string;
  roles: Role[];
}

// ⚠️ شِمّة تطوير مؤقتة: الهوية من رأس x-actor-id ثم القاعدة.
// تُستبدَل بجلسة Supabase Auth (JWT مُتحقَّق) قبل الإنتاج — لا تُعتمد للأمان الحقيقي بعد.
export async function getActor(req: Request): Promise<Actor | null> {
  const id = req.headers.get("x-actor-id");
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, roles: true },
  });
  return user ? { id: user.id, roles: user.roles } : null;
}

/** يرمي AuthorizationError (⟵ 403) إن لم يحمل الفاعل أحد الأدوار المطلوبة. */
export async function requireRoles(req: Request, roles: Role[]): Promise<Actor> {
  const actor = await getActor(req);
  if (!actor || !actor.roles.some((r) => roles.includes(r))) {
    throw new AuthorizationError("غير مخوّل.");
  }
  return actor;
}
