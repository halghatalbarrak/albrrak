import crypto from "node:crypto";

// ═══════════════ تشفير رمز الشاشة للنسخ (DISPLAY_SCREEN_RULES §٩) ═══════════════
//
// التحقّق عند فتح الشاشة يبقى بـ sha256 (screens.ts) كما هو. وإلى جانبه نحفظ الرمز مشفَّراً بـ
// AES-256-GCM بمفتاح البيئة DISPLAY_TOKEN_KEY (٣٢ بايت base64) ليُسترجَع للنسخ — لمن يملك صلاحية
// إدارة الشاشات وحده. غياب المفتاح يُعطّل النسخ فقط (الإصدار/الإلغاء/التحقّق تعمل). النصّ المخزَّن
// مُرقَّمٌ بنسخة المفتاح «v1:base64(iv+tag+enc)» ليتيح التدوير لاحقاً (كنمط رقم الهوية).

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const VERSION = "v1";

/** مفتاح ٣٢ بايت (base64) من البيئة — يرمي إن غاب أو كان بطولٍ خاطئ. */
function getKey(): Buffer {
  const raw = process.env.DISPLAY_TOKEN_KEY;
  if (!raw) throw new Error("DISPLAY_TOKEN_KEY غير مضبوط — تعذّر نسخ الرابط.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DISPLAY_TOKEN_KEY يجب أن يكون ٣٢ بايت (base64) لخوارزمية AES-256.");
  return key;
}

/** هل المفتاح مضبوطٌ بطولٍ صحيح؟ (لتعطيل النسخ بلطفٍ دون رمي). */
export function displayTokenKeyAvailable(): boolean {
  const raw = process.env.DISPLAY_TOKEN_KEY;
  if (!raw) return false;
  try {
    return Buffer.from(raw, "base64").length === 32;
  } catch {
    return false;
  }
}

/** تشفير الرمز ⟵ "v1:base64(iv+tag+enc)". */
export function encryptDisplayToken(token: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

/** فكّ التشفير — يفشل (يرمي) إن غاب المفتاح أو عُبث بالنص (GCM). */
export function decryptDisplayToken(stored: string): string {
  const sep = stored.indexOf(":");
  if (sep === -1) throw new Error("صيغة الرمز المشفَّر غير صالحة.");
  const buf = Buffer.from(stored.slice(sep + 1), "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
