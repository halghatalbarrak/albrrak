import { jwtVerify } from "jose";
import { type PrismaClient, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthenticationError, AuthorizationError } from "./errors";

// المصادقة الحقيقية: JWT من Supabase Auth ⟵ لا شِمّة، ولا رأس هوية يُصدَّق.
// المسار: Authorization: Bearer <jwt> ← تحقّق التوقيع ← sub ← User.authId ← الأدوار.

export interface Actor {
  id: string;
  roles: Role[];
}

function jwtSecret(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) {
    throw new Error("SUPABASE_JWT_SECRET غير مضبوط — تعذّر التحقّق من المصادقة.");
  }
  return new TextEncoder().encode(s);
}

/** يتحقّق من JWT ويعيد sub، أو يرمي AuthenticationError (⟵ 401). */
async function verifiedSub(req: Request): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AuthenticationError("لا رمز مصادقة.");
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (typeof payload.sub !== "string" || payload.sub === "") {
      throw new AuthenticationError("رمز بلا هوية.");
    }
    return payload.sub;
  } catch (e) {
    if (e instanceof AuthenticationError) throw e;
    throw new AuthenticationError("رمز مصادقة غير صالح.");
  }
}

/**
 * الهوية الكاملة: JWT.sub ← authId ← User فعّال ← الأدوار.
 * لا JWT/غير صالح ⟵ 401. مستخدم غير موجود أو معطَّل ⟵ 403.
 * (دون ١٣ لا authId ⟵ لا sub يحلّ إليه ⟵ يستحيل انتحاله بنيةً — م٤.)
 */
export async function requireAuth(
  req: Request,
  db: PrismaClient = prisma,
): Promise<Actor> {
  const sub = await verifiedSub(req);
  const user = await db.user.findUnique({
    where: { authId: sub },
    select: { id: true, roles: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new AuthorizationError("حساب غير موجود أو معطَّل.");
  }
  return { id: user.id, roles: user.roles };
}

/** يتطلّب مصادقة + أحد الأدوار. غير المخوّل ⟵ 403. */
export async function requireRoles(
  req: Request,
  roles: Role[],
  db: PrismaClient = prisma,
): Promise<Actor> {
  const actor = await requireAuth(req, db);
  if (!actor.roles.some((r) => roles.includes(r))) {
    throw new AuthorizationError("غير مخوّل.");
  }
  return actor;
}
