import crypto from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NATIONAL_ID_VIEWER_ROLES } from "./capabilities";
import { AuthorizationError } from "./errors";

// ═══ رقم الهوية — القاعدة المطلقة م٥ ═══
// مشفَّر (لا يُخزَّن صريحًا)، محجوب في العرض، وكل قراءةٍ صريحة تُسجَّل.
// لا يظهر في شهادة ولا تقرير ولا QR.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

// النصّ المخزَّن مُرقَّمٌ بنسخة المفتاح: "<versionId>:<base64(iv+tag+enc)>".
// يتيح تدوير المفتاح: تُشفَّر الجديدة بالنسخة الحالية، وتُفكّ القديمة بمفتاحها
// حتى تُعاد صياغتها. راجع README: «تدوير مفتاح رقم الهوية».
const CURRENT_KEY_VERSION = "v1";
const KEY_ENV: Record<string, string> = {
  v1: "NATIONAL_ID_ENC_KEY",
  // عند التدوير: v2: "NATIONAL_ID_ENC_KEY_V2",
};

// مفتاح ٣٢ بايت (base64) من البيئة حسب النسخة. سرّي — لا يُرفع.
function getKey(version: string): Buffer {
  const envName = KEY_ENV[version];
  if (!envName) {
    throw new Error(`نسخة مفتاح غير معروفة: ${version}`);
  }
  const raw = process.env[envName];
  if (!raw) {
    throw new Error(`${envName} غير مضبوط — لا يمكن التعامل مع رقم الهوية.`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${envName} يجب أن يكون ٣٢ بايت (base64) لخوارزمية AES-256.`);
  }
  return key;
}

/** تشفير رقم الهوية ⟵ "v1:base64(IV+وسم+نص مشفّر)". */
export function encryptNationalId(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(CURRENT_KEY_VERSION), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc]).toString("base64");
  return `${CURRENT_KEY_VERSION}:${blob}`;
}

/** فكّ التشفير — يختار المفتاح بنسخته، ويفشل (يرمي) إن عُبث بالنص (GCM). */
export function decryptNationalId(stored: string): string {
  const sep = stored.indexOf(":");
  if (sep === -1) {
    throw new Error("صيغة رقم الهوية المخزَّن غير صالحة (لا نسخة مفتاح).");
  }
  const version = stored.slice(0, sep);
  const buf = Buffer.from(stored.slice(sep + 1), "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(version), iv);
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
  args: ReadNationalIdArgs,
  db: PrismaClient = prisma,
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

export interface RevealApplicationArgs {
  applicationId: string;
  viewerId: string;
  viewerRoles: Role[];
  reason?: string;
}

/**
 * كشف رقم هوية متقدّمٍ (قبل القبول) — للكادر المخوّل فقط، بطلبٍ صريح،
 * وكل كشفٍ يُكتب سطرًا في سجل الاطّلاع (م٥). لا يظهر في أي كشفٍ افتراضيّ.
 */
export async function revealApplicationNationalId(
  args: RevealApplicationArgs,
  db: PrismaClient = prisma,
): Promise<string> {
  if (!args.viewerRoles.some((r) => NATIONAL_ID_VIEWER_ROLES.includes(r))) {
    throw new AuthorizationError("غير مخوّل بالاطّلاع على رقم الهوية (م٥).");
  }
  const app = await db.application.findUnique({
    where: { id: args.applicationId },
    select: { nationalIdEnc: true },
  });
  if (!app) {
    throw new AuthorizationError("طلب غير موجود.");
  }
  const plain = decryptNationalId(app.nationalIdEnc);
  await db.nationalIdAccessLog.create({
    data: {
      subjectId: args.applicationId,
      viewerId: args.viewerId,
      reason: args.reason ?? "كشف رقم هوية متقدّم",
    },
  });
  return plain;
}
