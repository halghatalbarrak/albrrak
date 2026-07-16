import crypto from "node:crypto";
import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { NATIONAL_ID_VIEWER_ROLES } from "./capabilities";
import { AuthorizationError } from "./errors";

// ═══ رقم الهوية — القاعدة المطلقة م٥ ═══
// مشفَّر (لا يُخزَّن صريحًا)، محجوب في العرض، وكل قراءةٍ صريحة تُسجَّل.
// لا يظهر في شهادة ولا تقرير ولا QR.

type Db = PrismaClient | Prisma.TransactionClient;

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

// مفتاح التشفير من البيئة (٣٢ بايت بترميز base64). سرّي — لا يُرفع.
function getKey(): Buffer {
  const raw = process.env.NATIONAL_ID_ENC_KEY;
  if (!raw) {
    throw new Error("NATIONAL_ID_ENC_KEY غير مضبوط — لا يمكن التعامل مع رقم الهوية.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("NATIONAL_ID_ENC_KEY يجب أن يكون ٣٢ بايت (base64) لخوارزمية AES-256.");
  }
  return key;
}

/** تشفير رقم الهوية ⟵ نصّ base64 يجمع: IV + وسم المصادقة + النص المشفّر. */
export function encryptNationalId(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** فكّ التشفير — يفشل (يرمي) إن عُبث بالنص (مصادقة GCM). */
export function decryptNationalId(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** الحجب للعرض — تُبقى آخر ٤ خانات فقط. لا يكشف الرقم فلا يحتاج تسجيلًا. */
export function maskNationalId(plain: string): string {
  const visible = 4;
  if (plain.length <= visible) return "•".repeat(plain.length);
  return "•".repeat(plain.length - visible) + plain.slice(-visible);
}

export interface ReadNationalIdArgs {
  viewerId: string;
  viewerRoles: Role[];
  /** صاحب الهوية (User.id). */
  subjectUserId: string;
  reason?: string;
}

/**
 * القراءة الصريحة الوحيدة المسموحة لرقم الهوية.
 * م٥: تُرفض لغير الكادر المخوّل (معلم يستعلم ← يُرفض)، وكل قراءة ناجحة
 * تُكتب سطرًا في سجل الاطّلاع. تُرجع النص الصريح.
 */
export async function readNationalId(
  db: Db,
  args: ReadNationalIdArgs,
): Promise<string> {
  const allowed = args.viewerRoles.some((r) =>
    NATIONAL_ID_VIEWER_ROLES.includes(r),
  );
  if (!allowed) {
    throw new AuthorizationError(
      "غير مخوّل بالاطّلاع على رقم الهوية (م٥).",
    );
  }

  const subject = await db.user.findUnique({
    where: { id: args.subjectUserId },
    select: { nationalId: true },
  });
  if (!subject?.nationalId) {
    throw new AuthorizationError("لا يوجد رقم هوية لهذا المستخدم.");
  }

  const plain = decryptNationalId(subject.nationalId);

  // سجل الاطّلاع — إلزامي مع كل قراءة صريحة (م٥).
  await db.nationalIdAccessLog.create({
    data: {
      subjectId: args.subjectUserId,
      viewerId: args.viewerId,
      reason: args.reason ?? null,
    },
  });

  return plain;
}
