import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { type PrismaClient, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthenticationError, AuthorizationError } from "./errors";

// المصادقة الحقيقية: JWT من Supabase Auth. الدخول يقع في المتصفّح عبر supabase-js
// ولا يمرّ بخادمنا — فأول تحقّقٍ فعليّ هو هنا. Supabase قد يوقّع بمفتاحٍ غير متماثل
// (ES256/RS256 عبر JWKS) أو بسرٍّ مشترك (HS256). ندعم الحالتين ونوزّع حسب alg.
// المسار: Authorization: Bearer <jwt> ← تحقّق التوقيع ← sub ← User.authId ← الأدوار.

export interface Actor {
  id: string;
  roles: Role[];
}

/** السرّ المشترك (HS256) — مسارٌ بديل تحتاجه الاختبارات (بلا شبكة). */
function hsSecret(): Uint8Array | null {
  const s = process.env.SUPABASE_JWT_SECRET;
  return s ? new TextEncoder().encode(s) : null;
}

/** مجموعة مفاتيح JWKS البعيدة (غير المتماثلة) — تُنشأ مرّةً وتُخزَّن (لا جلبٌ في كل طلب). */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function remoteJwks() {
  if (!jwks) {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
      /\/$/,
      "",
    );
    if (!base) {
      throw new AuthenticationError("لا عنوان Supabase للتحقّق غير المتماثل (JWKS).");
    }
    jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

/**
 * يختار مفتاح التحقّق حسب خوارزمية الرمز:
 *   HS*      ⟵ السرّ المشترك (متماثل)
 *   غير ذلك  ⟵ JWKS البعيدة (ES256/RS256 غير متماثلة)
 */
export const defaultGetKey: JWTVerifyGetKey = (header, input) => {
  if ((header.alg ?? "").startsWith("HS")) {
    const s = hsSecret();
    if (!s) throw new AuthenticationError("HS256 يحتاج SUPABASE_JWT_SECRET.");
    return Promise.resolve(s);
  }
  return remoteJwks()(header, input);
};

/**
 * يتحقّق من رمزٍ ويعيد sub، أو يرمي AuthenticationError.
 * getKey قابل للحقن (الاختبار يميّز HS256 من ES256 بلا شبكة).
 * عند الرفض: سطر تشخيصٍ يبيّن alg وسبب الرفض — بلا كشف الرمز.
 */
export async function verifyJwtSub(
  token: string,
  getKey: JWTVerifyGetKey = defaultGetKey,
): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, getKey);
    if (typeof payload.sub !== "string" || payload.sub === "") {
      throw new AuthenticationError("رمز بلا هوية.");
    }
    return payload.sub;
  } catch (e) {
    if (e instanceof AuthenticationError) throw e;
    let alg = "?";
    try {
      alg = decodeProtectedHeader(token).alg ?? "?";
    } catch {
      /* رمزٌ غير قابل للتحليل أصلًا */
    }
    const reason = e instanceof Error ? `${e.name}` : String(e);
    // تشخيص: لماذا رُفض التحقّق بالضبط — بلا كشف الرمز أو محتواه.
    console.error(`[auth] رفض التحقّق: alg=${alg} reason=${reason}`);
    throw new AuthenticationError("رمز مصادقة غير صالح.");
  }
}

/** يتحقّق من JWT في الترويسة ويعيد sub، أو يرمي AuthenticationError (⟵ 401). */
async function verifiedSub(req: Request): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AuthenticationError("لا رمز مصادقة.");
  return verifyJwtSub(token);
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
