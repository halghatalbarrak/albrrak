import { randomBytes } from "node:crypto";

// رفع أصلٍ إلى Supabase Storage (bucket certificates، عامّ القراءة). **اسمٌ عشوائيّ**
// لا يُخمَّن (قرار محمد: لا student-12.png). يحتاج SUPABASE_SERVICE_ROLE_KEY.

export async function uploadCertificatePng(buffer: Buffer): Promise<string> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("تخزين الشهادات غير مضبوط (SUPABASE_SERVICE_ROLE_KEY/URL).");

  const name = `${randomBytes(16).toString("hex")}.png`; // عشوائيّ — لا تُخمَّن الروابط
  // المفتاح يُرسَل بترويسة apikey **و** authorization: مفاتيح Supabase الجديدة
  // (sb_secret_…) ليست JWT، فترويسة Bearer وحدها تفشل بـ«Invalid Compact JWS».
  // إرسالها apikey يقبلها التخزين، وإرسالها Bearer أيضاً يبقى متوافقاً مع مفتاح
  // service_role القديم (JWT). فالجمع بينهما يعمل مع النوعين.
  const res = await fetch(`${base}/storage/v1/object/certificates/${name}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "image/png", "x-upsert": "false" },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`فشل رفع الشهادة: ${res.status}`);
  return `${base}/storage/v1/object/public/certificates/${name}`;
}
