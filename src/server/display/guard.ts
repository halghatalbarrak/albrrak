import { Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/server/errors";

// حارس إدارة الشاشات (مدير المنصّة) — في وحدةٍ مستقلّة ليتشاركه admin.ts وschedules.ts بلا دورةٍ دائريّة.
const PLATFORM_MANAGE: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

export async function assertDisplayAdmin(actorUserId: string, db: PrismaClient = prisma): Promise<void> {
  const u = await db.user.findUnique({ where: { id: actorUserId }, select: { roles: true } });
  if (!u) throw new AuthorizationError("مستخدم غير موجود.");
  if (!u.roles.some((r) => PLATFORM_MANAGE.includes(r))) throw new AuthorizationError("إدارة الشاشات لمدير المنصّة.");
}
