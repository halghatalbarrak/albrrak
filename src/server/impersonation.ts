import { createHmac, timingSafeEqual } from "node:crypto";

import { Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";
import type { Actor } from "./auth";

// ═══════════════ انتحال الشخصيّة (Impersonation) — طبقةٌ فوق الجلسة ═══════════════
//
// ميزةٌ حسّاسة: المدير التقنيّ (TECH_ADMIN) وحده يتصفّح المنصّة بعين مستخدمٍ أدنى.
// **لا تبدّل جلسة Supabase Auth**؛ بل تُخزَّن «هويّة الانتحال» في كوكي httpOnly **موقّعة**
// (HMAC) فوق الجلسة. الفاعل الحقيقيّ (المدير التقنيّ) محفوظٌ دائمًا، والصلاحيّات والعرض
// أثناء الانتحال = المنتحَل. الحُرّاس كلّها في الخادم (لا الواجهة).

export const IMPERSONATION_COOKIE = "imp";
const MAX_AGE_SEC = 60 * 60 * 2; // ساعتان — جلسة انتحالٍ قصيرة (تُجدَّد بالبدء ثانيةً).

export interface ImpersonationPayload {
  act: string; // الفاعل الحقيقيّ (المدير التقنيّ)
  imp: string; // المنتحَل
  iat: number; // لحظة الإصدار (ثوانٍ)
}

/** سرّ توقيع الكوكي — خادميٌّ بحت. غيابه ⟵ فشلٌ آمن (لا توقيع، لا قبول). */
function secret(): Buffer | null {
  const s = process.env.IMPERSONATION_SECRET;
  return s && s.length >= 16 ? Buffer.from(s, "utf8") : null;
}

const b64u = (b: Buffer) => b.toString("base64url");
const hmac = (data: string, key: Buffer) => createHmac("sha256", key).update(data).digest();

/**
 * يوقّع حمولة الانتحال (HMAC-SHA256): base64url(json) + "." + base64url(sig).
 * يرمي إن لم يُضبط السرّ — فشلٌ آمن (لا يبدأ انتحالٌ بلا حماية).
 */
export function signImpersonation(p: ImpersonationPayload): string {
  const key = secret();
  if (!key) throw new ValidationError("الانتحال غير مُهيّأ (IMPERSONATION_SECRET مفقود).");
  const body = b64u(Buffer.from(JSON.stringify(p), "utf8"));
  return `${body}.${b64u(hmac(body, key))}`;
}

/**
 * يتحقّق من قيمة كوكي الانتحال ويعيد الحمولة، أو null (توقيعٌ خاطئ/تلاعبٌ/انتهاء/لا سرّ).
 * المقارنة بزمنٍ ثابت (timingSafeEqual) دفعًا لتسريب التوقيت.
 */
export function verifyImpersonation(value: string): ImpersonationPayload | null {
  const key = secret();
  if (!key) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  let sig: Buffer;
  try { sig = Buffer.from(value.slice(dot + 1), "base64url"); } catch { return null; }
  const expected = hmac(body, key);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  let payload: ImpersonationPayload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ImpersonationPayload; }
  catch { return null; }
  if (typeof payload.act !== "string" || typeof payload.imp !== "string" || typeof payload.iat !== "number") return null;
  if (Date.now() / 1000 - payload.iat > MAX_AGE_SEC) return null; // انتهت
  return payload;
}

/** يستخرج قيمة كوكي الانتحال من ترويسة Cookie الخام. */
export function parseImpCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === IMPERSONATION_COOKIE) return rest.join("=");
  }
  return null;
}

const COOKIE_ATTRS = `Path=/; HttpOnly; Secure; SameSite=Lax`;
/** كوكي التعيين (httpOnly + Secure + SameSite=Lax) — المتصفّح لا يقرؤها ولا يزوّرها. */
export function buildSetCookie(signed: string): string {
  return `${IMPERSONATION_COOKIE}=${signed}; ${COOKIE_ATTRS}; Max-Age=${MAX_AGE_SEC}`;
}
/** كوكي المسح (Max-Age=0) — تُنهي الانتحال فورًا. */
export function buildClearCookie(): string {
  return `${IMPERSONATION_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`;
}

// ═══════════════ الحُرّاس الصارمة — تُنفَّذ في الخادم ═══════════════

/**
 * يتحقّق أنّ الفاعل الحقيقيّ يحقّ له انتحال الهدف. يرمي عند أيّ مخالفة:
 *  - لا تسلسل: منتحَلٌ لا يبدأ انتحالًا (يُفحَص الفاعل الحقيقيّ لا المنتحَل).
 *  - TECH_ADMIN وحده يبدأ الانتحال.
 *  - لا يُنتحَل مديرٌ تقنيّ آخر (الأدوار الأدنى فقط).
 *  - الهدف موجودٌ فعّالٌ وليس الفاعلَ نفسه.
 */
export async function assertCanImpersonate(
  realActor: Actor,
  targetUserId: string,
  db: PrismaClient = prisma,
): Promise<{ nameAsInId: string; roles: Role[] }> {
  if (realActor.impersonating) {
    throw new AuthorizationError("لا يمكن بدء انتحالٍ أثناء انتحال (يُفحَص الفاعل الحقيقيّ).");
  }
  if (!realActor.roles.includes(Role.TECH_ADMIN)) {
    throw new AuthorizationError("الانتحال للمدير التقنيّ وحده.");
  }
  if (targetUserId === realActor.realActorId) {
    throw new ValidationError("لا تنتحل نفسك.");
  }
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { isActive: true, roles: true, nameAsInId: true },
  });
  if (!target || !target.isActive) {
    throw new ValidationError("المستخدم غير موجودٍ أو معطَّل.");
  }
  if (target.roles.includes(Role.TECH_ADMIN)) {
    throw new AuthorizationError("لا يُنتحَل مديرٌ تقنيّ.");
  }
  return { nameAsInId: target.nameAsInId, roles: target.roles };
}

/**
 * يبدأ الانتحال: يتحقّق من الحُرّاس، يوثّق حدث البدء (الفاعل الحقيقيّ)، ويعيد الحمولة
 * لتُوقَّع وتوضَع في الكوكي. الحدث actorId = الفاعل الحقيقيّ (المدير التقنيّ) — لا انتحال بعد.
 */
export async function startImpersonation(
  realActor: Actor,
  targetUserId: string,
  db: PrismaClient = prisma,
): Promise<ImpersonationPayload> {
  const target = await assertCanImpersonate(realActor, targetUserId, db);
  await emitEvent(db, {
    type: "IMPERSONATION_STARTED",
    subjectType: "User",
    subjectId: targetUserId,
    actorId: realActor.realActorId,
    payload: { targetName: target.nameAsInId, targetRoles: target.roles },
  });
  return { act: realActor.realActorId, imp: targetUserId, iat: Math.floor(Date.now() / 1000) };
}

/** ينهي الانتحال: يوثّق حدث الإنهاء (إن كان منتحلًا). المسح الفعليّ للكوكي في المسار. */
export async function stopImpersonation(actor: Actor, db: PrismaClient = prisma): Promise<void> {
  if (!actor.impersonating) return; // idempotent — لا انتحالٌ نشط
  await emitEvent(db, {
    type: "IMPERSONATION_STOPPED",
    subjectType: "User",
    subjectId: actor.id, // المنتحَل
    actorId: actor.realActorId, // الفاعل الحقيقيّ
    payload: {},
  });
}
