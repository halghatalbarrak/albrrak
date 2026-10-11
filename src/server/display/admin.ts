import { DisplayAssetType, DisplayScreenKind, DisplaySlideKind, Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/server/events";
import { AuthorizationError, ValidationError } from "@/server/errors";
import { programName } from "@/i18n/ar/gamification";

// ═══════════════ إدارة الشاشات (ش٣) ═══════════════
// مدير المنصّة يُنشئ الشاشات ويربط الرموز ويرتّب الشرائح ويرفع الصور والخلفيّات. لا حذف
// (التعطيل بـactive، والخلفيّة append-only). إنشاء الشاشة/الرمز وإلغاؤه في screens.ts.

const PLATFORM_MANAGE: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];
export async function assertDisplayAdmin(actorUserId: string, db: PrismaClient = prisma): Promise<void> {
  const u = await db.user.findUnique({ where: { id: actorUserId }, select: { roles: true } });
  if (!u) throw new AuthorizationError("مستخدم غير موجود.");
  if (!u.roles.some((r) => PLATFORM_MANAGE.includes(r))) throw new AuthorizationError("إدارة الشاشات لمدير المنصّة.");
}

const nextOrdinal = async (screenId: string, db: PrismaClient): Promise<number> => {
  const last = await db.displaySlide.findFirst({ where: { screenId }, orderBy: { ordinal: "desc" }, select: { ordinal: true } });
  return (last?.ordinal ?? -1) + 1;
};

export async function addProgramSlide(actorUserId: string, screenId: string, programId: string, durationSec: number | undefined, db: PrismaClient = prisma): Promise<{ id: string }> {
  await assertDisplayAdmin(actorUserId, db);
  if (!(await db.program.findUnique({ where: { id: programId }, select: { id: true } }))) throw new ValidationError("برنامجٌ غير موجود.");
  const row = await db.displaySlide.create({ data: { screenId, ordinal: await nextOrdinal(screenId, db), kind: DisplaySlideKind.PROGRAM, programId, ...(durationSec ? { durationSec } : {}) }, select: { id: true } });
  return row;
}

export async function addImageSlide(actorUserId: string, screenId: string, imageUrl: string, durationSec: number | undefined, db: PrismaClient = prisma): Promise<{ id: string }> {
  await assertDisplayAdmin(actorUserId, db);
  if (!imageUrl) throw new ValidationError("رابط الصورة مطلوب.");
  return db.displaySlide.create({ data: { screenId, ordinal: await nextOrdinal(screenId, db), kind: DisplaySlideKind.IMAGE, imageUrl, ...(durationSec ? { durationSec } : {}) }, select: { id: true } });
}

export async function setSlide(actorUserId: string, slideId: string, patch: { durationSec?: number; active?: boolean }, db: PrismaClient = prisma): Promise<void> {
  await assertDisplayAdmin(actorUserId, db);
  const data: { durationSec?: number; active?: boolean } = {};
  if (patch.durationSec !== undefined) { if (!Number.isInteger(patch.durationSec) || patch.durationSec < 1) throw new ValidationError("المدّة عددٌ موجب."); data.durationSec = patch.durationSec; }
  if (patch.active !== undefined) data.active = patch.active;
  if (Object.keys(data).length === 0) return;
  await db.displaySlide.update({ where: { id: slideId }, data });
}

/** يرتّب شرائح شاشةٍ حسب ترتيب المعرّفات الممرَّر (ordinal = الفهرس). */
export async function reorderSlides(actorUserId: string, screenId: string, orderedIds: string[], db: PrismaClient = prisma): Promise<void> {
  await assertDisplayAdmin(actorUserId, db);
  // updateMany بشرط (id + screenId) يمنع إعادة ترتيب شرائح شاشةٍ أخرى.
  await db.$transaction(orderedIds.map((id, i) => db.displaySlide.updateMany({ where: { id, screenId }, data: { ordinal: i } })));
}

/** يرفع خلفيّةً لنوع شاشة (append-only): يعطّل سابقتها المفعّلة ويُنشئ الجديدة مفعّلة. */
export async function addBackground(actorUserId: string, screenKind: DisplayScreenKind, assetUrl: string, assetType: DisplayAssetType, db: PrismaClient = prisma): Promise<{ id: string }> {
  await assertDisplayAdmin(actorUserId, db);
  if (!assetUrl) throw new ValidationError("رابط الأصل مطلوب.");
  return db.$transaction(async (tx) => {
    await tx.displayBackground.updateMany({ where: { screenKind, active: true }, data: { active: false } });
    const row = await tx.displayBackground.create({ data: { screenKind, assetUrl, assetType, active: true }, select: { id: true } });
    await emitEvent(tx, { type: "DISPLAY_BACKGROUND_SET", subjectType: "DisplayBackground", subjectId: row.id, actorId: actorUserId, payload: { screenKind } });
    return row;
  });
}

export interface ScreenDetail {
  id: string; kind: DisplayScreenKind; nameAr: string; studentId: string | null; active: boolean; hasActiveToken: boolean;
  slides: { id: string; ordinal: number; kind: DisplaySlideKind; durationSec: number; programNameAr: string | null; imageUrl: string | null; active: boolean }[];
}

/** تفصيل شاشةٍ للمدير (الشرائح بأسماء البرامج، ووجود رمزٍ فعّال). */
export async function getScreenDetail(screenId: string, db: PrismaClient = prisma): Promise<ScreenDetail | null> {
  const s = await db.displayScreen.findUnique({ where: { id: screenId } });
  if (!s) return null;
  const token = await db.displayScreenToken.findFirst({ where: { screenId, revokedAt: null }, select: { id: true } });
  const slides = await db.displaySlide.findMany({ where: { screenId }, orderBy: { ordinal: "asc" } });
  const progIds = [...new Set(slides.filter((x) => x.programId).map((x) => x.programId!))];
  const progs = progIds.length ? await db.program.findMany({ where: { id: { in: progIds } }, select: { id: true, key: true } }) : [];
  const keyById = new Map(progs.map((p) => [p.id, p.key]));
  return {
    id: s.id, kind: s.kind, nameAr: s.nameAr, studentId: s.studentId, active: s.active, hasActiveToken: !!token,
    slides: slides.map((x) => ({ id: x.id, ordinal: x.ordinal, kind: x.kind, durationSec: x.durationSec, programNameAr: x.programId ? programName(keyById.get(x.programId) ?? "") : null, imageUrl: x.imageUrl, active: x.active })),
  };
}

/** البرامج (للقائمة المنسدلة في إضافة شريحة برنامج). */
export async function listProgramsForSlides(db: PrismaClient = prisma) {
  const progs = await db.program.findMany({ select: { id: true, key: true } });
  return progs.map((p) => ({ id: p.id, nameAr: programName(p.key) }));
}

/** بحثُ طلابٍ بالاسم (لربط شاشة البيت بالابن) — المفعّلون فقط، محدودٌ بعشرين. */
export async function searchStudents(query: string, db: PrismaClient = prisma): Promise<{ id: string; name: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db.student.findMany({
    where: { user: { isActive: true, nameAsInId: { contains: q } } },
    select: { id: true, user: { select: { nameAsInId: true } } },
    take: 20,
  });
  return rows.map((r) => ({ id: r.id, name: r.user.nameAsInId }));
}
