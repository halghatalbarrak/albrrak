import type { PermissionDelegation, Prisma, PrismaClient, Role } from "@prisma/client";
import { CAPABILITY_ORIGIN_ROLES, type Capability } from "./capabilities";
import { AuthorizationError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

// نافذة تفويضٍ فعّالة = لم تُلغَ (revokedAt IS NULL).
type ActiveDelegation = Pick<PermissionDelegation, "capability" | "holderRole" | "revokedAt">;

/**
 * هل يملك صاحبُ هذه الأدوار هذه الصلاحية؟ (دالّة نقيّة — قابلة للاختبار بلا قاعدة)
 * DESIGN §٣٫٣: الأصل للمدير، والتفويض على مستوى الأدوار لا الأفراد.
 */
export function resolveCapability(
  actorRoles: Role[],
  capability: Capability,
  activeDelegations: ActiveDelegation[],
): boolean {
  // الأدوار صاحبة الصلاحية أصالةً (المدير/المشرف).
  if (actorRoles.some((r) => CAPABILITY_ORIGIN_ROLES.includes(r))) {
    return true;
  }
  // تفويضٌ فعّال لهذه الصلاحية إلى دورٍ يحمله الفاعل.
  return activeDelegations.some(
    (d) =>
      d.revokedAt === null &&
      d.capability === capability &&
      actorRoles.includes(d.holderRole),
  );
}

/** يقرأ أدوار الفاعل والتفويضات الفعّالة من القاعدة ثم يحسم. */
export async function actorHasCapability(
  db: Db,
  actorId: string,
  capability: Capability,
): Promise<boolean> {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { roles: true },
  });
  if (!actor) return false;

  const delegations = await db.permissionDelegation.findMany({
    where: { capability, revokedAt: null },
    select: { capability: true, holderRole: true, revokedAt: true },
  });

  return resolveCapability(actor.roles, capability, delegations);
}

/** يرمي AuthorizationError إن لم يملك الفاعل الصلاحية. */
export async function assertCapability(
  db: Db,
  actorId: string,
  capability: Capability,
): Promise<void> {
  if (!(await actorHasCapability(db, actorId, capability))) {
    throw new AuthorizationError(`غير مخوّل بالصلاحية: ${capability}`);
  }
}
