import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
  type KeyLike,
} from "jose";
import { describe, expect, it } from "vitest";
import { verifyJwtSub } from "../auth";
import { AuthenticationError } from "../errors";

// لا شبكة في الاختبار ⟵ نُحاكي JWKS محلّيًّا. الغرض: إثبات أنّ التحقّق يوزّع حسب alg،
// وأنّ سلوكنا القديم (HS256 فقط) هو ما يرفض رمز المشروع غير المتماثل ← عطب الإنتاج.

const SECRET = new TextEncoder().encode("test-shared-secret-for-hs256-0123456789");

function hsToken(sub: string, secret = SECRET) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function es256Setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  jwk.alg = "ES256";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  return { privateKey, jwks };
}

function es256Token(sub: string, privateKey: KeyLike) {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

describe("التحقّق يميّز HS256 (سرّ مشترك) من ES256 (JWKS غير متماثل)", () => {
  it("HS256 بسرٍّ صحيح ← يُقبل ويعيد sub", async () => {
    const getKey: JWTVerifyGetKey = () => Promise.resolve(SECRET);
    expect(await verifyJwtSub(await hsToken("user-1"), getKey)).toBe("user-1");
  });

  it("ES256 عبر JWKS (توزيعٌ حسب alg) ← يُقبل", async () => {
    const { privateKey, jwks } = await es256Setup();
    const getKey: JWTVerifyGetKey = (header, input) =>
      (header.alg ?? "").startsWith("HS") ? Promise.resolve(SECRET) : jwks(header, input);
    expect(await verifyJwtSub(await es256Token("user-2", privateKey), getKey)).toBe("user-2");
  });

  it("رمز ES256 على تحقّقٍ يعرف HS256 فقط ← يُرفض (هذا عطب الإنتاج بالضبط)", async () => {
    const { privateKey } = await es256Setup();
    const hsOnly: JWTVerifyGetKey = () => Promise.resolve(SECRET); // كسلوكنا القديم
    await expect(
      verifyJwtSub(await es256Token("user-3", privateKey), hsOnly),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("HS256 بسرٍّ خاطئ ← يُرفض", async () => {
    const getKey: JWTVerifyGetKey = () => Promise.resolve(SECRET);
    const forged = await hsToken("user-4", new TextEncoder().encode("wrong-secret-wrong-secret-wrong-01"));
    await expect(verifyJwtSub(forged, getKey)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("رمزٌ مشوَّه ← يُرفض (لا انهيار)", async () => {
    const getKey: JWTVerifyGetKey = () => Promise.resolve(SECRET);
    await expect(verifyJwtSub("not.a.jwt", getKey)).rejects.toBeInstanceOf(AuthenticationError);
  });
});
