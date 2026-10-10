import { MotivationKind, Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/server/events";
import { AuthorizationError, ValidationError } from "@/server/errors";
import { DEFAULT_TEMPLATES, type MotivationTemplates } from "./motivation";

// ═══════════════ إدارة التلعيب — تعريفات الأوسمة وقوالب التحفيز (ل٦) ═══════════════
//
// المدير يفعّل/يعطّل/يعدّل اسم الوسام ووصفه وعتبته (من القائمة المعرَّفة؛ النوع والرمز ثابتان، لا
// شرطٌ حرّ §٥)، ويحرّر نصّ قوالب التحفيز (بمتغيّراتها المحدّدة). لا حذف. النصّ في i18n/القاعدة.

const PLATFORM_MANAGE: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];
async function assertGamiAdmin(actorUserId: string, db: PrismaClient): Promise<void> {
  const u = await db.user.findUnique({ where: { id: actorUserId }, select: { roles: true } });
  if (!u) throw new AuthorizationError("مستخدم غير موجود.");
  if (!u.roles.some((r) => PLATFORM_MANAGE.includes(r))) throw new AuthorizationError("إدارة التلعيب لمدير المنصّة.");
}

// ── تعريفات الأوسمة ──

export interface BadgeDefPatch { nameAr?: string; descAr?: string; threshold?: number | null; active?: boolean; sortOrder?: number }

/** يعدّل تعريف وسامٍ قائماً (الاسم/الوصف/العتبة/التفعيل/الترتيب). النوع والرمز لا يُمسّان. */
export async function updateBadgeDefinition(actorUserId: string, id: string, patch: BadgeDefPatch, db: PrismaClient = prisma): Promise<void> {
  await assertGamiAdmin(actorUserId, db);
  const existing = await db.badgeDefinition.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ValidationError("تعريفٌ غير موجود.");
  const data: BadgeDefPatch = {};
  if (patch.nameAr !== undefined) { if (!patch.nameAr.trim()) throw new ValidationError("الاسم مطلوب."); data.nameAr = patch.nameAr.trim(); }
  if (patch.descAr !== undefined) { if (!patch.descAr.trim()) throw new ValidationError("الوصف مطلوب."); data.descAr = patch.descAr.trim(); }
  if (patch.threshold !== undefined) {
    if (patch.threshold !== null && (!Number.isInteger(patch.threshold) || patch.threshold < 1)) throw new ValidationError("العتبة عددٌ صحيحٌ موجب.");
    data.threshold = patch.threshold;
  }
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (Object.keys(data).length === 0) return;
  await db.badgeDefinition.update({ where: { id }, data });
  await emitEvent(db, { type: "BADGE_DEFINITION_UPDATED", subjectType: "BadgeDefinition", subjectId: id, actorId: actorUserId, payload: { keys: Object.keys(data) } });
}

// ── قوالب التحفيز ──

export interface TemplateRow { kind: MotivationKind; textAr: string; active: boolean }

/** قوالب التحفيز للعرض/التحرير — الموجود في القاعدة مع الافتراض لما لم يُبذَر بعد. */
export async function listMotivationTemplates(db: PrismaClient = prisma): Promise<TemplateRow[]> {
  const rows = await db.motivationTemplate.findMany();
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return (Object.keys(DEFAULT_TEMPLATES) as (keyof MotivationTemplates)[]).map((k) => {
    const row = byKind.get(k as MotivationKind);
    return { kind: k as MotivationKind, textAr: row?.textAr ?? DEFAULT_TEMPLATES[k], active: row?.active ?? true };
  });
}

/** يُرجع القوالب المفعّلة كخريطةٍ لِـbuildMotivations (المعطّل يسقط إلى نصٍّ فارغ فلا يظهر نوعه). */
export async function activeTemplatesMap(db: PrismaClient = prisma): Promise<MotivationTemplates> {
  const rows = await listMotivationTemplates(db);
  const map = { ...DEFAULT_TEMPLATES };
  for (const r of rows) map[r.kind as keyof MotivationTemplates] = r.active ? r.textAr : "";
  return map;
}

/** يحرّر نصّ قالبٍ أو تفعيله (upsert على النوع). */
export async function updateMotivationTemplate(actorUserId: string, kind: MotivationKind, patch: { textAr?: string; active?: boolean }, db: PrismaClient = prisma): Promise<void> {
  await assertGamiAdmin(actorUserId, db);
  const textAr = patch.textAr?.trim();
  if (patch.textAr !== undefined && !textAr) throw new ValidationError("نصّ القالب مطلوب.");
  await db.motivationTemplate.upsert({
    where: { kind },
    update: { ...(textAr !== undefined ? { textAr } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) },
    create: { kind, textAr: textAr ?? DEFAULT_TEMPLATES[kind as keyof MotivationTemplates], active: patch.active ?? true },
  });
  await emitEvent(db, { type: "MOTIVATION_TEMPLATE_UPDATED", subjectType: "MotivationTemplate", subjectId: kind, actorId: actorUserId, payload: {} });
}
