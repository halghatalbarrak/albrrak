import { randomBytes } from "node:crypto";

// رفع أصلٍ إلى Supabase Storage (bucket certificates، عامّ القراءة). **اسمٌ عشوائيّ**
// لا يُخمَّن (قرار محمد: لا student-12.png). يحتاج SUPABASE_SERVICE_ROLE_KEY.

/**
 * يرفع أصلاً إلى Supabase Storage (bucket `certificates` العامّ، باسمٍ عشوائيّ لا يُخمَّن) ويعيد
 * رابطه العامّ. يُستعمل للشهادات وأصول الشاشة التحفيزيّة (صور الشرائح والخلفيّات). يحدّ الامتداد
 * والنوع المسموحان منعاً لرفع ما لا يُعرَض.
 */
export async function uploadPublicAsset(buffer: Buffer, opts: { contentType: string; ext: string }): Promise<string> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("التخزين غير مضبوط (SUPABASE_SERVICE_ROLE_KEY/URL).");

  const name = `${randomBytes(16).toString("hex")}.${opts.ext}`; // عشوائيّ — لا تُخمَّن الروابط
  // المفتاح يُرسَل apikey **و** authorization: مفاتيح sb_secret_… ليست JWT (تفشل بـBearer وحدها)،
  // وservice_role القديم JWT — فالجمع يعمل مع النوعين.
  const res = await fetch(`${base}/storage/v1/object/certificates/${name}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": opts.contentType, "x-upsert": "false" },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`فشل الرفع: ${res.status}`);
  return `${base}/storage/v1/object/public/certificates/${name}`;
}

export function uploadCertificatePng(buffer: Buffer): Promise<string> {
  return uploadPublicAsset(buffer, { contentType: "image/png", ext: "png" });
}
