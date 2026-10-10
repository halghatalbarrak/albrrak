import { createHash, randomBytes } from "node:crypto";

import { DisplayScreenKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/server/events";
import { ValidationError } from "@/server/errors";

// ═══════════════ الشاشات ورموزها (ش١) ═══════════════
//
// الرمز سرّيٌّ دائم، يُلغى يدويّاً فقط. يُخزَّن sha256(token) وحده — لا نصّ صريح. يظهر الرابط الكامل
// للمدير مرّةً واحدة عند الإنشاء/التجديد. append-only: التجديد يُلغي الحاليّ ويُنشئ جديداً (لا حذف).

const hashToken = (token: string): string => createHash("sha256").update(token.trim()).digest("hex");
const newToken = (): string => randomBytes(24).toString("base64url"); // ٣٢ محرفاً معتِّماً، لا معرّفَ داخليّ

export async function createScreen(args: { kind: DisplayScreenKind; nameAr: string; studentId?: string | null; refreshSec?: number }, db: PrismaClient = prisma): Promise<{ id: string }> {
  const nameAr = args.nameAr?.trim();
  if (!nameAr) throw new ValidationError("اسم الشاشة مطلوب.");
  if (args.kind === DisplayScreenKind.HOME && !args.studentId) throw new ValidationError("شاشة البيت تحتاج ربط الابن.");
  if (args.kind === DisplayScreenKind.MOSQUE && args.studentId) throw new ValidationError("شاشة المسجد بلا ابنٍ مرتبط.");
  const s = await db.displayScreen.create({
    data: { kind: args.kind, nameAr, studentId: args.studentId ?? null, ...(args.refreshSec ? { refreshSec: args.refreshSec } : {}) },
    select: { id: true },
  });
  await emitEvent(db, { type: "DISPLAY_SCREEN_CREATED", subjectType: "DisplayScreen", subjectId: s.id, payload: { kind: args.kind } });
  return s;
}

/** يُصدر رمزاً جديداً (يُلغي الحاليّ). يعيد النصّ الصريح **مرّةً واحدة** — لا يُخزَّن ولا يُسترجَع. */
export async function issueToken(screenId: string, db: PrismaClient = prisma): Promise<{ token: string }> {
  const screen = await db.displayScreen.findUnique({ where: { id: screenId }, select: { id: true } });
  if (!screen) throw new ValidationError("شاشةٌ غير موجودة.");
  const token = newToken();
  await db.$transaction(async (tx) => {
    await tx.displayScreenToken.updateMany({ where: { screenId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.displayScreenToken.create({ data: { screenId, tokenHash: hashToken(token) } });
    await emitEvent(tx, { type: "DISPLAY_TOKEN_ISSUED", subjectType: "DisplayScreen", subjectId: screenId, payload: {} });
  });
  return { token };
}

/** يُلغي الرمز الفعّال للشاشة (لا حذف). */
export async function revokeToken(screenId: string, db: PrismaClient = prisma): Promise<{ revoked: number }> {
  const r = await db.displayScreenToken.updateMany({ where: { screenId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count) await emitEvent(db, { type: "DISPLAY_TOKEN_REVOKED", subjectType: "DisplayScreen", subjectId: screenId, payload: {} });
  return { revoked: r.count };
}

export interface ResolvedScreen { id: string; kind: DisplayScreenKind; nameAr: string; studentId: string | null; refreshSec: number }

/** يحلّ الشاشة من رمزها الصريح (بمقارنة sha256). null إن لم يوجد رمزٌ فعّالٌ مطابق أو الشاشة معطّلة. */
export async function resolveScreenByToken(token: string, db: PrismaClient = prisma): Promise<ResolvedScreen | null> {
  const t = token?.trim();
  if (!t) return null;
  const row = await db.displayScreenToken.findUnique({ where: { tokenHash: hashToken(t) }, select: { revokedAt: true, screenId: true } });
  if (!row || row.revokedAt) return null;
  const screen = await db.displayScreen.findUnique({ where: { id: row.screenId }, select: { id: true, kind: true, nameAr: true, studentId: true, refreshSec: true, active: true } });
  if (!screen || !screen.active) return null;
  return { id: screen.id, kind: screen.kind, nameAr: screen.nameAr, studentId: screen.studentId, refreshSec: screen.refreshSec };
}

export interface ScreenRow { id: string; kind: DisplayScreenKind; nameAr: string; studentId: string | null; active: boolean; hasActiveToken: boolean }

/** قائمة الشاشات للمدير (بلا كشف الرمز — نعرض فقط ألهُ رمزٌ فعّال). */
export async function listScreens(db: PrismaClient = prisma): Promise<ScreenRow[]> {
  const screens = await db.displayScreen.findMany({ orderBy: { createdAt: "desc" } });
  const active = await db.displayScreenToken.findMany({ where: { revokedAt: null }, select: { screenId: true } });
  const withToken = new Set(active.map((a) => a.screenId));
  return screens.map((s) => ({ id: s.id, kind: s.kind, nameAr: s.nameAr, studentId: s.studentId, active: s.active, hasActiveToken: withToken.has(s.id) }));
}
