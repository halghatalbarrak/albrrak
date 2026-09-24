// أداة تنفيذٍ عبر Supabase Management API (HTTPS فقط) — لا اتّصال Postgres مباشر (المنفذ محجوب P1001).
// POST https://api.supabase.com/v1/projects/{ref}/database/query  Authorization: Bearer <token>  body:{query}
// الرمز يُقرأ من البيئة (SUPABASE_ACCESS_TOKEN) فقط — لا يُطبع ولا يُكتب في أي ملف أو سجلّ إطلاقاً.
import { readFileSync, existsSync } from "node:fs";

function loadDotenv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!(m[1] in env)) env[m[1]] = v;
    }
  }
  return env;
}

const dotenv = loadDotenv();

/** يستخرج مرجع المشروع من DATABASE_URL (اسم المستخدم postgres.<ref>). */
export function projectRef() {
  const du = dotenv.DATABASE_URL || process.env.DATABASE_URL || "";
  const m = du.match(/postgres\.([a-z0-9]+)/i) || du.match(/@db\.([a-z0-9]+)\.supabase/i);
  if (!m) throw new Error("تعذّر استخراج ref من DATABASE_URL.");
  return m[1];
}

function token() {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t) throw new Error("SUPABASE_ACCESS_TOKEN غير موجود في البيئة.");
  return t;
}

const REF = projectRef();
const ENDPOINT = `https://api.supabase.com/v1/projects/${REF}/database/query`;

/**
 * ينفّذ SQL عبر الـAPI ويعيد صفوف النتيجة (مصفوفة كائنات) أو يرمي خطأً واضحاً.
 * لا يطبع الرمز. عند الفشل يعرض حالة HTTP ورسالة الـAPI فقط.
 */
export async function query(sql) {
  const auth = `Bearer ${token()}`;
  let res, lastErr;
  const MAX = 8;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
      });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e; // أخطاء شبكيّة عابرة (fetch failed) — أعد المحاولة بمهلةٍ متصاعدة
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }
  if (lastErr) {
    const cause = lastErr.cause ? ` (cause: ${lastErr.cause.code || lastErr.cause.message})` : "";
    throw new Error(`فشل شبكيّ في الاتّصال بالـAPI بعد ${MAX} محاولات: ${lastErr.message}${cause}`);
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body && typeof body === "object" ? (body.message || body.error || JSON.stringify(body)) : String(body);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return body; // عادةً مصفوفة صفوف
}

export const REF_PUBLIC = REF;
