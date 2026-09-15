import { randomBytes } from "node:crypto";

import {
  ActivationPurpose,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { type AuthProvider, defaultAuthProvider } from "./auth-provider";
import { syntheticEmail } from "./account";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ إدارة المستخدمين (المرحلة أ) — ROLES.md ═══════════════
//
// **كلّ القواعد مطلقة في الخادم** (DESIGN §٢). صلاحية الوصول لكلّ عمليّات هذه الوحدة:
// SUPER_ADMIN أو TECH_ADMIN فقط (ROLES.md: إدارة المستخدمين للمشرف والمدير التقنيّ).
//
// ترتيب الأدوار للحُرّاس: TECH_ADMIN > SUPER_ADMIN > CIRCLE_MANAGER > الباقي. لا يمنح
// أحدٌ دوراً أعلى من أعلى أدواره، ولا يعدّل أدوار نفسه، ولا يُقفل النظام (آخر مدير تقنيّ).
//
// ملاحظة (دَينٌ مؤجّل في ROLES.md): معنى SUPER_ADMIN في بقيّة الحُرّاس لم يُغيَّر بعد؛
// هنا نضيف طبقة إدارة المستخدمين فوق القائم بلا مساسٍ بمعاني الأدوار الأخرى.

/** من يملك إدارة المستخدمين (ROLES.md). */
const USER_ADMIN_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.TECH_ADMIN];

/** رتبة الدور — للحارس «لا تمنح أعلى من دورك». الأعلى رقماً أعلى سلطةً. */
const ROLE_RANK: Record<Role, number> = {
  TECH_ADMIN: 4,
  SUPER_ADMIN: 3,
  CIRCLE_MANAGER: 2,
  REGISTRAR: 1,
  TEACHER: 1,
  RECITER: 1,
  ARIF: 1,
  STUDENT: 1,
  GUARDIAN: 1,
};

const highestRank = (roles: Role[]): number =>
  roles.reduce((max, r) => Math.max(max, ROLE_RANK[r]), 0);

const isUserAdmin = (roles: Role[]): boolean =>
  roles.some((r) => USER_ADMIN_ROLES.includes(r));

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** يرمي AuthorizationError إن لم يكن الفاعل من كادر إدارة المستخدمين، ويعيد أدواره. */
async function assertUserAdmin(actorId: string, db: PrismaClient): Promise<Role[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!isUserAdmin(actor.roles)) {
    throw new AuthorizationError("إدارة المستخدمين للمشرف العام والمدير التقنيّ فقط (ROLES.md).");
  }
  return actor.roles;
}

/** عدد المديرين التقنيّين الفعّالين — لمنع إقفال النظام. */
async function countActiveTechAdmins(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<number> {
  return db.user.count({ where: { isActive: true, roles: { has: Role.TECH_ADMIN } } });
}

function newToken(): string {
  return randomBytes(32).toString("hex"); // ٦٤ محرفاً — لا يُخمَّن
}

function activationUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://halaqat-albarrak.com").replace(/\/$/, "");
  return `${base}/activate?token=${token}`;
}

// ═══════════════ العرض ═══════════════

export interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: Role[];
  isActive: boolean;
  isStudent: boolean;
}

export async function listUsers(actorId: string, db: PrismaClient = prisma): Promise<UserRow[]> {
  await assertUserAdmin(actorId, db);
  const rows = await db.user.findMany({
    select: {
      id: true, nameAsInId: true, phone: true, email: true, roles: true, isActive: true,
      student: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.nameAsInId,
    phone: r.phone,
    email: r.email,
    roles: r.roles,
    isActive: r.isActive,
    isStudent: r.student !== null,
  }));
}

// ═══════════════ إضافة كادر ═══════════════

export interface CreateStaffArgs {
  name: string;
  phone: string;
  roles: Role[];
}

export interface CreateStaffResult {
  userId: string;
  activationUrl: string;
}

/**
 * ينشئ حساب كادرٍ مباشرةً (بلا قيد): يتحقّق التفرّد والصلاحيّة، ينشئ حساب Auth عبر المنفذ،
 * ثمّ User + رابط تفعيل (ACTIVATE)، ويعيد الرابط الكامل. إنشاء Auth **خارج المعاملة**
 * (نداءٌ شبكيّ — كنمط acceptApplication)؛ فإن فشلت المعاملة بعده يُسجَّل authId اليتيم.
 */
export async function createStaff(
  actorId: string,
  args: CreateStaffArgs,
  db: PrismaClient = prisma,
  provider: AuthProvider = defaultAuthProvider,
): Promise<CreateStaffResult> {
  const actorRoles = await assertUserAdmin(actorId, db);

  const name = args.name?.trim();
  if (!name) throw new ValidationError("اسم الكادر مطلوب.");
  if (!args.roles || args.roles.length === 0) throw new ValidationError("لا بدّ من دورٍ واحدٍ على الأقلّ.");
  for (const r of args.roles) {
    if (!Object.values(Role).includes(r)) throw new ValidationError("دورٌ غير معروف.");
  }
  // لا يمنح المُنشئ دوراً أعلى من أعلى أدواره.
  const ceiling = highestRank(actorRoles);
  if (args.roles.some((r) => ROLE_RANK[r] > ceiling)) {
    throw new AuthorizationError("لا تمنح دوراً أعلى من دورك.");
  }

  const email = syntheticEmail(args.phone); // يرمي إن كان الجوال غير صالح
  const clash = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) throw new ValidationError("هذا الجوال مستعمَلٌ لحسابٍ قائم.");

  // إنشاء مستخدم المصادقة أوّلاً (شبكة، خارج المعاملة).
  const { authId } = await provider.createAuthUser({ email, phone: args.phone });

  const token = newToken();
  try {
    const userId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nameAsInId: name,
          gender: "MALE", // حقلٌ إلزاميّ؛ الكادر لا يُعرَض جنسه — قيمةٌ محايدة افتراضيّة
          phone: args.phone,
          email,
          authId,
          roles: args.roles,
        },
        select: { id: true },
      });
      await tx.activationLink.create({
        data: {
          userId: user.id,
          token,
          purpose: ActivationPurpose.ACTIVATE,
          expiresAt: new Date(Date.now() + LINK_TTL_MS),
          createdByUserId: actorId,
        },
      });
      await emitEvent(tx, {
        type: "USER_CREATED",
        subjectType: "User",
        subjectId: user.id,
        actorId,
        payload: { roles: args.roles },
      });
      return user.id;
    });
    return { userId, activationUrl: activationUrl(token) };
  } catch (e) {
    // المعاملة فشلت بعد إنشاء حساب Auth ⟵ سجّل اليتيم لتنظيفٍ يدويّ (لا صمت).
    console.error(`[user-management] حساب Auth يتيم بعد فشل الإنشاء: authId=${authId}`);
    throw e;
  }
}

// ═══════════════ تعطيل/تفعيل ═══════════════

export async function setActive(
  actorId: string,
  userId: string,
  active: boolean,
  db: PrismaClient = prisma,
) {
  await assertUserAdmin(actorId, db);
  const target = await db.user.findUnique({ where: { id: userId }, select: { roles: true, isActive: true } });
  if (!target) throw new ValidationError("مستخدم غير موجود.");

  if (!active) {
    if (userId === actorId) throw new ValidationError("لا تعطّل حسابك.");
    // منع تعطيل آخر مدير تقنيّ فعّال.
    if (target.isActive && target.roles.includes(Role.TECH_ADMIN)) {
      if ((await countActiveTechAdmins(db)) <= 1) {
        throw new ValidationError("لا يُعطَّل آخر مدير تقنيّ فعّال.");
      }
    }
  }

  const updated = await db.user.update({ where: { id: userId }, data: { isActive: active } });
  await emitEvent(db, {
    type: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    subjectType: "User",
    subjectId: userId,
    actorId,
  });
  return updated;
}

// ═══════════════ تعديل الأدوار ═══════════════

export async function setRoles(
  actorId: string,
  userId: string,
  roles: Role[],
  db: PrismaClient = prisma,
) {
  const actorRoles = await assertUserAdmin(actorId, db);
  if (userId === actorId) throw new ValidationError("لا تعدّل أدوار حسابك.");

  const next = [...new Set(roles)];
  if (next.length === 0) throw new ValidationError("لا بدّ من دورٍ واحدٍ على الأقلّ.");
  for (const r of next) {
    if (!Object.values(Role).includes(r)) throw new ValidationError("دورٌ غير معروف.");
  }
  // لا يمنح الفاعل دوراً أعلى من أعلى أدواره.
  const ceiling = highestRank(actorRoles);
  if (next.some((r) => ROLE_RANK[r] > ceiling)) {
    throw new AuthorizationError("لا تمنح دوراً أعلى من دورك.");
  }

  const target = await db.user.findUnique({ where: { id: userId }, select: { roles: true, isActive: true } });
  if (!target) throw new ValidationError("مستخدم غير موجود.");

  // نزع آخر مدير تقنيّ فعّال ⟵ يُمنع (إقفال النظام).
  const wasTech = target.isActive && target.roles.includes(Role.TECH_ADMIN);
  const staysTech = next.includes(Role.TECH_ADMIN);
  if (wasTech && !staysTech && (await countActiveTechAdmins(db)) <= 1) {
    throw new ValidationError("لا يُنزع آخر مدير تقنيّ فعّال.");
  }

  const updated = await db.user.update({ where: { id: userId }, data: { roles: { set: next } } });
  await emitEvent(db, {
    type: "USER_ROLES_CHANGED",
    subjectType: "User",
    subjectId: userId,
    actorId,
    payload: { from: target.roles, to: next },
  });
  return updated;
}

// ═══════════════ إعادة تعيين كلمة السرّ ═══════════════

export async function resetPassword(
  actorId: string,
  userId: string,
  db: PrismaClient = prisma,
): Promise<{ activationUrl: string }> {
  await assertUserAdmin(actorId, db);
  const target = await db.user.findUnique({ where: { id: userId }, select: { authId: true } });
  if (!target) throw new ValidationError("مستخدم غير موجود.");
  if (!target.authId) throw new ValidationError("المستخدم بلا حساب دخول — لا كلمة سرّ.");

  const token = newToken();
  await db.activationLink.create({
    data: {
      userId,
      token,
      purpose: ActivationPurpose.RESET,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
      createdByUserId: actorId,
    },
  });
  await emitEvent(db, {
    type: "USER_PASSWORD_RESET_REQUESTED",
    subjectType: "User",
    subjectId: userId,
    actorId,
  });
  return { activationUrl: activationUrl(token) };
}

// ═══════════════ التفعيل العامّ (بلا تسجيل دخول) ═══════════════

export interface ActivationStatus {
  purpose: ActivationPurpose;
}

/** يتحقّق أنّ الرمز صالح (موجود، غير مستعمل، غير منتهٍ) — يرمي ValidationError وإلا. */
export async function getActivationStatus(
  token: string,
  db: PrismaClient = prisma,
): Promise<ActivationStatus> {
  const link = await db.activationLink.findUnique({
    where: { token },
    select: { purpose: true, usedAt: true, expiresAt: true },
  });
  if (!link) throw new ValidationError("رابط تفعيلٍ غير صالح.");
  if (link.usedAt) throw new ValidationError("هذا الرابط استُعمِل من قبل.");
  if (link.expiresAt.getTime() < Date.now()) throw new ValidationError("انتهت صلاحيّة هذا الرابط.");
  return { purpose: link.purpose };
}

/**
 * يُكمل التفعيل: يتحقّق الرمز، يضبط كلمة السرّ في Supabase Auth، ويبطل الرابط (usedAt).
 * ضبط كلمة السرّ (شبكة) يسبق الإبطال، فلا يُحرَق الرابط إن فشل الضبط.
 */
export async function completeActivation(
  token: string,
  password: string,
  db: PrismaClient = prisma,
  provider: AuthProvider = defaultAuthProvider,
): Promise<void> {
  if (!password || password.length < 8) {
    throw new ValidationError("كلمة السرّ ثمانية أحرفٍ فأكثر.");
  }
  const link = await db.activationLink.findUnique({
    where: { token },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!link) throw new ValidationError("رابط تفعيلٍ غير صالح.");
  if (link.usedAt) throw new ValidationError("هذا الرابط استُعمِل من قبل.");
  if (link.expiresAt.getTime() < Date.now()) throw new ValidationError("انتهت صلاحيّة هذا الرابط.");

  const user = await db.user.findUnique({ where: { id: link.userId }, select: { authId: true } });
  if (!user?.authId) throw new ValidationError("المستخدم بلا حساب دخول.");

  await provider.setPassword({ authId: user.authId, password });

  // إبطالٌ محميٌّ من السباق: لا يُبطل إلا إن كان لم يُستعمل بعد.
  const marked = await db.activationLink.updateMany({
    where: { id: link.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (marked.count === 0) throw new ValidationError("هذا الرابط استُعمِل من قبل.");

  await emitEvent(db, {
    type: "USER_ACTIVATED",
    subjectType: "User",
    subjectId: link.userId,
    actorId: link.userId,
  });
}
