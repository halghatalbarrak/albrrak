import { SignJWT } from "jose";
import { type AuthProvider } from "../auth-provider";

// مزوّر مصادقة مزيّف — يعيد authId فريدًا بلا شبكة (بديل Supabase Admin في الاختبار).
let seq = 0;
export const fakeAuthProvider: AuthProvider = {
  async createAuthUser({ email }) {
    seq += 1;
    return { authId: `auth-${email}-${seq}` };
  },
};

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET ?? "");
}

/** يسكّ JWT موقَّعًا بنفس السرّ الذي يتحقّق منه الخادم (HS256). */
export async function mintJwt(
  sub: string,
  opts: { expired?: boolean } = {},
): Promise<string> {
  const nowSec = Math.floor(new Date().getTime() / 1000);
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt(nowSec)
    .setExpirationTime(opts.expired ? nowSec - 3600 : nowSec + 3600)
    .sign(secret());
}
