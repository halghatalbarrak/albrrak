import { MuddakirFaceState, MuddakirStaffRole, Role, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuth, type Actor } from "./auth";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ أدوار المدّكر المُحصَّرة وصلاحيّاتها (§٢، و١) ═══════════════
//
// الأدوار (MANAGER/ADMIN/SUPERVISOR/EXAMINER) إسنادٌ خاصٌّ بالمدّكر (MuddakirStaff)، لا دورٌ عامٌّ في
// Role — فلا تفتح شيئاً في مراقي أو بقيّة المنصّة. سارّي المشرف/المختبِر يقبلان الدورَ العامّ القائم
// (ARIF/RECITER) أو دور المدّكر الخاصّ. مدير المنصّة (SUPER_ADMIN/CIRCLE_MANAGER) فوق الجميع.

type Db = PrismaClient | Prisma.TransactionClient;

/** أدوار منصّةٍ تُعادل إدارة المدّكر الكاملة (فوق مدير البرنامج). */
export const PLATFORM_MANAGE_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];
const isPlatformManager = (roles: readonly Role[]): boolean => roles.some((r) => PLATFORM_MANAGE_ROLES.includes(r));

/** أدوار المدّكر النشطة لمستخدم (endedAt = null). */
export async function activeStaffRoles(db: Db, userId: string): Promise<MuddakirStaffRole[]> {
  const rows = await db.muddakirStaff.findMany({ where: { userId, endedAt: null }, select: { role: true } });
  return [...new Set(rows.map((r) => r.role))];
}

export interface MuddakirCaps {
  manage: boolean;   // مدير المنصّة أو مدير البرنامج — إدارةٌ كاملة
  admin: boolean;    // الإداريّ — يطّلع، وإجراءاته بطلب
  supervise: boolean; // يملك سارّي المشرف (ARIF أو SUPERVISOR الخاصّ أو مدير)
  examine: boolean;  // يملك سارّي المختبِر (RECITER أو EXAMINER الخاصّ أو مدير)
  view: boolean;     // يرى إدارة المدّكر (أيٌّ ممّا سبق)
  staffRoles: MuddakirStaffRole[];
}

/** صلاحيّات المدّكر لفاعلٍ (دورُه العامّ + إسناد المدّكر). */
export async function muddakirCaps(db: Db, actor: { id: string; roles: Role[] }): Promise<MuddakirCaps> {
  const staff = await activeStaffRoles(db, actor.id);
  const manage = isPlatformManager(actor.roles) || staff.includes(MuddakirStaffRole.MANAGER);
  const admin = staff.includes(MuddakirStaffRole.ADMIN);
  const supervise = manage || actor.roles.includes(Role.ARIF) || staff.includes(MuddakirStaffRole.SUPERVISOR);
  const examine = manage || actor.roles.includes(Role.RECITER) || staff.includes(MuddakirStaffRole.EXAMINER);
  return { manage, admin, supervise, examine, view: manage || admin || supervise || examine, staffRoles: staff };
}

const capsForUser = async (db: Db, userId: string): Promise<MuddakirCaps> => {
  const u = await db.user.findUnique({ where: { id: userId }, select: { roles: true } });
  if (!u) throw new AuthorizationError("مستخدم غير موجود.");
  return muddakirCaps(db, { id: userId, roles: u.roles });
};

/** هل يملك المستخدم سارّي المشرف في المدّكر (ARIF أو SUPERVISOR الخاصّ)؟ */
export async function isSupervisorCapable(db: Db, userId: string): Promise<boolean> {
  return (await capsForUser(db, userId)).supervise;
}
/** هل يملك المستخدم سارّي المختبِر في المدّكر (RECITER أو EXAMINER الخاصّ)؟ */
export async function isExaminerCapable(db: Db, userId: string): Promise<boolean> {
  return (await capsForUser(db, userId)).examine;
}

// ── التعيين والإنهاء (append-only، لا حذف) ──

/**
 * يُسند دور مدّكرٍ لمستخدم (§٢): MANAGER لا يُسنده إلا مدير المنصّة؛ وبقيّة الأدوار يُسندها مديرُ
 * المنصّة أو مدير البرنامج. idempotent: إسنادٌ نشطٌ بالدور نفسه لا يُكرَّر. يُسجَّل المُعيِّن.
 */
export async function assignStaff(args: { actorUserId: string; targetUserId: string; role: MuddakirStaffRole }, db: PrismaClient = prisma): Promise<{ id: string; already: boolean }> {
  const actor = await db.user.findUnique({ where: { id: args.actorUserId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  const platformManager = isPlatformManager(actor.roles);
  if (args.role === MuddakirStaffRole.MANAGER) {
    if (!platformManager) throw new AuthorizationError("تعيين مدير البرنامج لمدير المنصّة وحده.");
  } else {
    const caps = await muddakirCaps(db, { id: args.actorUserId, roles: actor.roles });
    if (!caps.manage) throw new AuthorizationError("التعيين لمدير البرنامج (أو مدير المنصّة).");
  }
  const target = await db.user.findUnique({ where: { id: args.targetUserId }, select: { id: true } });
  if (!target) throw new ValidationError("المستخدم الهدف غير موجود.");
  const existing = await db.muddakirStaff.findFirst({ where: { userId: args.targetUserId, role: args.role, endedAt: null }, select: { id: true } });
  if (existing) return { id: existing.id, already: true };
  const created = await db.muddakirStaff.create({ data: { userId: args.targetUserId, role: args.role, assignedBy: args.actorUserId }, select: { id: true } });
  await emitEvent(db, { type: "MUDDAKIR_STAFF_ASSIGNED", subjectType: "User", subjectId: args.targetUserId, actorId: args.actorUserId, payload: { role: args.role } });
  return { id: created.id, already: false };
}

/** يُنهي إسناد دورٍ (بلا حذف). صلاحيّةٌ كالتعيين. */
export async function endStaff(args: { actorUserId: string; targetUserId: string; role: MuddakirStaffRole }, db: PrismaClient = prisma): Promise<{ ended: number }> {
  const actor = await db.user.findUnique({ where: { id: args.actorUserId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  const platformManager = isPlatformManager(actor.roles);
  if (args.role === MuddakirStaffRole.MANAGER) {
    if (!platformManager) throw new AuthorizationError("إنهاء مدير البرنامج لمدير المنصّة وحده.");
  } else {
    const caps = await muddakirCaps(db, { id: args.actorUserId, roles: actor.roles });
    if (!caps.manage) throw new AuthorizationError("الإنهاء لمدير البرنامج (أو مدير المنصّة).");
  }
  const r = await db.muddakirStaff.updateMany({ where: { userId: args.targetUserId, role: args.role, endedAt: null }, data: { endedAt: new Date() } });
  if (r.count) await emitEvent(db, { type: "MUDDAKIR_STAFF_ENDED", subjectType: "User", subjectId: args.targetUserId, actorId: args.actorUserId, payload: { role: args.role } });
  return { ended: r.count };
}

export interface StaffRow { userId: string; name: string; role: MuddakirStaffRole }

/** إسنادات المدّكر النشطة (لشاشة المدير). */
export async function listStaff(db: PrismaClient = prisma): Promise<StaffRow[]> {
  const rows = await db.muddakirStaff.findMany({ where: { endedAt: null }, select: { userId: true, role: true } });
  const ids = [...new Set(rows.map((r) => r.userId))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, nameAsInId: true } }) : [];
  const nameBy = new Map(users.map((u) => [u.id, u.nameAsInId]));
  return rows.map((r) => ({ userId: r.userId, name: nameBy.get(r.userId) ?? "—", role: r.role })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ── مقترحو الإشراف (§٢): من أتمّ نصف القرآن فأكثر ──

/** نصف المصحف (٦٠٤ وجهاً ÷ ٢). الوجه محفوظٌ إن لم يكن state = NEW (كـgetStageProgress). */
export const HALF_QURAN_FACES = 302;

export interface SupervisorCandidate { userId: string; name: string; memorizedFaces: number }

/**
 * مقترحون لإسناد الإشراف: كلّ من أتمّ نصف القرآن فأكثر (§٢)، بصرف النظر عن طوره (فمن أنهى الحفظ
 * أولى). يُحسب المحفوظ بعدّ الأوجه التي ليست NEW. مرتّبون تنازليّاً بالمحفوظ.
 */
export async function listSupervisorCandidates(db: PrismaClient = prisma): Promise<SupervisorCandidate[]> {
  const grouped = await db.muddakirFace.groupBy({ by: ["studentId"], where: { state: { not: MuddakirFaceState.NEW } }, _count: { _all: true } });
  const qualified = grouped.filter((g) => g._count._all >= HALF_QURAN_FACES);
  if (!qualified.length) return [];
  const faceBy = new Map(qualified.map((g) => [g.studentId, g._count._all]));
  const students = await db.student.findMany({ where: { id: { in: qualified.map((g) => g.studentId) } }, select: { id: true, userId: true, user: { select: { nameAsInId: true } } } });
  return students
    .map((s) => ({ userId: s.userId, name: s.user.nameAsInId, memorizedFaces: faceBy.get(s.id) ?? 0 }))
    .sort((a, b) => b.memorizedFaces - a.memorizedFaces);
}

export interface AssignableUser { id: string; name: string }

/** مستخدمون نشطون لإسناد أدوار المدّكر (لغير الإشراف يختار المدير أيّ مستخدم). */
export async function listAssignableUsers(db: PrismaClient = prisma): Promise<AssignableUser[]> {
  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true, nameAsInId: true } });
  return users.map((u) => ({ id: u.id, name: u.nameAsInId })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** هل الفاعل مدير منصّة (يحقّ له تعيين «مدير البرنامج»)؟ */
export const isPlatformManagerRoles = (roles: readonly Role[]): boolean => isPlatformManager(roles);

// ── حارس المسارات: يسمح لمدير المنصّة أو ذوي أدوار المدّكر بحسب الحاجة ──

export type MuddakirNeed = "view" | "manage" | "supervise" | "examine";
export interface MuddakirActor extends Actor { caps: MuddakirCaps }

/** يصادق الطلب ويتحقّق من صلاحيّة المدّكر المطلوبة؛ يرمي 403 إن لم تتوفّر. */
export async function requireMuddakir(req: Request, need: MuddakirNeed, db: PrismaClient = prisma): Promise<MuddakirActor> {
  const actor = await requireAuth(req, db);
  const caps = await muddakirCaps(db, actor);
  if (!caps[need]) throw new AuthorizationError("غير مصرَّح بهذا في المُدَّكِر.");
  return { ...actor, caps };
}
