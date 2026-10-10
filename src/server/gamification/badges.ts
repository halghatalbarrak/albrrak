import { type BadgeConditionKind, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/server/events";

// ═══════════════ الأوسمة — المنح والقراءة (ل١، §٥) ═══════════════
//
// منحٌ append-only يُمنح مرّةً واحدة لكلّ (طالب، تعريف) — يحميه @@unique([studentId, badgeDefId]).
// لا سحبٌ بعد المنح (§٥): لا دالّة إلغاء. التعريفات يحرّرها المدير من قائمةٍ معرَّفة (ل٦).

type Db = PrismaClient | Prisma.TransactionClient;

export interface AwardArgs { studentId: string; badgeDefId: string; sourceEvent: string; sourceRef?: string | null }

/**
 * يمنح وساماً لطالبٍ مرّةً واحدة. إن كان ممنوحاً سلفاً أعاد null بلا تكرار (idempotent). يُصدر
 * BADGE_AWARDED عند المنح الأوّل فقط. آمنٌ لإعادة الاستدعاء من المُقيّم (ل٤).
 */
export async function awardBadge(db: Db, args: AwardArgs): Promise<{ id: string } | null> {
  const existing = await db.badgeGrant.findUnique({
    where: { studentId_badgeDefId: { studentId: args.studentId, badgeDefId: args.badgeDefId } },
    select: { id: true },
  });
  if (existing) return null; // مُنح سلفاً — لا تكرار، لا حدث
  const grant = await db.badgeGrant.create({
    data: { studentId: args.studentId, badgeDefId: args.badgeDefId, sourceEvent: args.sourceEvent, sourceRef: args.sourceRef ?? null },
    select: { id: true },
  });
  await emitEvent(db, { type: "BADGE_AWARDED", subjectType: "Student", subjectId: args.studentId, actorId: null, payload: { badgeDefId: args.badgeDefId, sourceEvent: args.sourceEvent } });
  return grant;
}

export interface EarnedBadge {
  badgeDefId: string;
  code: string;
  kind: BadgeConditionKind;
  category: string;
  nameAr: string;
  descAr: string;
  emoji: string | null;
  earnedAt: Date;
}

/** أوسمة الطالب المكتسبة (مع تعريفاتها)، الأحدث أوّلاً. */
export async function listStudentBadges(studentId: string, db: PrismaClient = prisma): Promise<EarnedBadge[]> {
  const grants = await db.badgeGrant.findMany({ where: { studentId }, orderBy: { earnedAt: "desc" } });
  if (!grants.length) return [];
  const defs = await db.badgeDefinition.findMany({ where: { id: { in: grants.map((g) => g.badgeDefId) } } });
  const byId = new Map(defs.map((d) => [d.id, d]));
  return grants.flatMap((g) => {
    const d = byId.get(g.badgeDefId);
    if (!d) return [];
    return [{ badgeDefId: d.id, code: d.code, kind: d.kind, category: d.category, nameAr: d.nameAr, descAr: d.descAr, emoji: d.emoji, earnedAt: g.earnedAt }];
  });
}

/** تعريفات الأوسمة (للمدير وصفحة الطالب). activeOnly يقصرها على المفعّلة. */
export async function listBadgeDefinitions(db: PrismaClient = prisma, opts: { activeOnly?: boolean } = {}) {
  return db.badgeDefinition.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
}
