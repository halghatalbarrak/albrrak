import { randomBytes } from "node:crypto";

import {
  ActivationPurpose,
  MuddakirStaffRole,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { type AuthProvider, defaultAuthProvider } from "./auth-provider";
import { syntheticEmail, normalizeSaudiPhone } from "./account";
import { emitEvent } from "./events";
import { verr, aerr } from "./errors";
import { activeStaffRoles, assertMuddakirExclusivity, assignStaff, endStaff } from "./muddakir-staff";

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
  SELLER: 1,
};

const highestRank = (roles: Role[]): number =>
  roles.reduce((max, r) => Math.max(max, ROLE_RANK[r]), 0);

const isUserAdmin = (roles: Role[]): boolean =>
  roles.some((r) => USER_ADMIN_ROLES.includes(r));

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** يرمي AuthorizationError إن لم يكن الفاعل من كادر إدارة المستخدمين، ويعيد أدواره. */
async function assertUserAdmin(actorId: string, db: PrismaClient): Promise<Role[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw aerr("userNotFound");
  if (!isUserAdmin(actor.roles)) {
    throw aerr("userAdminRolesOnly");
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
  /** أدوار طاقم المدّكر النشطة (MuddakirStaff) — تُعرض شاراتٍ بجانب الأدوار العامّة. */
  muddakirStaff: MuddakirStaffRole[];
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
  // أدوار المدّكر النشطة لكلّ المستخدمين دفعةً واحدة (لا استعلامٌ لكلّ صفّ).
  const staff = await db.muddakirStaff.findMany({ where: { endedAt: null }, select: { userId: true, role: true } });
  const staffBy = new Map<string, MuddakirStaffRole[]>();
  for (const s of staff) staffBy.set(s.userId, [...new Set([...(staffBy.get(s.userId) ?? []), s.role])]);
  return rows.map((r) => ({
    id: r.id,
    name: r.nameAsInId,
    phone: r.phone,
    email: r.email,
    roles: r.roles,
    isActive: r.isActive,
    isStudent: r.student !== null,
    muddakirStaff: staffBy.get(r.id) ?? [],
  }));
}

// ═══════════════ إضافة كادر ═══════════════

export interface CreateStaffArgs {
  name: string;
  phone: string;
  roles: Role[];
  /** وظيفة مدّكرٍ واحدة (و١): إن أُعطيت فالأدوار العامّة فارغة، وتُسنَد بعد الإنشاء. */
  muddakirStaff?: MuddakirStaffRole[];
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
  if (!name) throw verr("staffNameRequired");
  // حصر الوظائف (و١): موظّف المدّكر بلا دورٍ عامّ (وظيفةٌ واحدة)؛ وإلّا فدورٌ عامٌّ واحدٌ على الأقلّ.
  const newStaff = args.muddakirStaff ?? [];
  if (newStaff.length > 0) {
    assertMuddakirExclusivity(args.roles ?? [], newStaff);
  } else if (!args.roles || args.roles.length === 0) {
    throw verr("atLeastOneRole");
  }
  for (const r of args.roles) {
    if (!Object.values(Role).includes(r)) throw verr("unknownRole");
  }
  // لا يمنح المُنشئ دوراً أعلى من أعلى أدواره.
  const ceiling = highestRank(actorRoles);
  if (args.roles.some((r) => ROLE_RANK[r] > ceiling)) {
    throw aerr("noRoleAboveYours");
  }

  // توحيد صيغة الجوال (05… / +9665… / 009665…) فتتطابق الصيغ المختلفة لنفس الرقم (منع ازدواج).
  const rawPhone = args.phone.trim();
  const canon = normalizeSaudiPhone(rawPhone); // 9665XXXXXXXX للسعوديّ
  const phoneStored = canon.startsWith("966") ? `+${canon}` : rawPhone; // E.164 للسعوديّ، وإلا كما أُدخل
  const email = syntheticEmail(canon); // بريدٌ من الصيغة الموحّدة (يرمي إن كان الجوال غير صالح)

  // كشف التكرار بكلّ صيغه (البريد الموحّد والخام، وصيغ الجوال) ⟵ رسالةٌ واضحة لا «خطأ داخلي».
  const phoneVariants = [...new Set([rawPhone, canon, `+${canon}`, canon.startsWith("966") ? "0" + canon.slice(3) : canon])];
  const clash = await db.user.findFirst({
    where: { OR: [{ email }, { email: syntheticEmail(rawPhone) }, { phone: { in: phoneVariants } }] },
    select: { id: true },
  });
  if (clash) throw verr("phoneTakenByAnother");

  // إنشاء مستخدم المصادقة أوّلاً (شبكة، خارج المعاملة). الفشل غالباً تكرارٌ في المصادقة
  // (الجوال مسجَّلٌ بصيغةٍ أخرى) ⟵ نترجمه لرسالةٍ واضحة، ونُسجّل الخطأ الحقيقيّ للتشخيص.
  let authId: string;
  try {
    ({ authId } = await provider.createAuthUser({ email, phone: phoneStored }));
  } catch (e) {
    const info = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[user-management] createAuthUser فشل (phone=${phoneStored}): ${info}`);
    const status = (e as { status?: number }).status;
    const duplicate = status === 409 || status === 422 || /exist|registered|duplicate|already/i.test(info);
    if (duplicate) throw verr("phoneTakenByAnother");
    throw e; // غير التكرار: يبقى ٥٠٠ لكنّه مُسجَّلٌ بتفصيله أعلاه (لإصلاح السبب)
  }

  const token = newToken();
  try {
    const userId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nameAsInId: name,
          gender: "MALE", // حقلٌ إلزاميّ؛ الكادر لا يُعرَض جنسه — قيمةٌ محايدة افتراضيّة
          phone: phoneStored,
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
    // إسناد وظيفة المدّكر بعد الإنشاء (و١): الهدف بأدوارٍ عامّةٍ فارغة، فيمرّ حارس الحصر في assignStaff.
    for (const role of newStaff) await assignStaff({ actorUserId: actorId, targetUserId: userId, role }, db);
    return { userId, activationUrl: activationUrl(token) };
  } catch (e) {
    // المعاملة فشلت بعد إنشاء حساب Auth ⟵ عوّض بحذف حساب الدخول المُنشأ للتوّ (لا حساب دخولٍ يتيم).
    // فإن فشل الحذف نفسه يُسجَّل بوضوحٍ مع authId لتنظيفٍ يدويّ، ولا يُبتلع الخطأ الأصليّ.
    try {
      await provider.deleteAuthUser({ authId });
    } catch (delErr) {
      const info = delErr instanceof Error ? `${delErr.name}: ${delErr.message}` : String(delErr);
      console.error(`[user-management] تعذّر حذف حساب Auth اليتيم authId=${authId}: ${info}`);
    }
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
  if (!target) throw verr("userNotFound");

  if (!active) {
    if (userId === actorId) throw verr("noDeactivateSelf");
    // منع تعطيل آخر مدير تقنيّ فعّال.
    if (target.isActive && target.roles.includes(Role.TECH_ADMIN)) {
      if ((await countActiveTechAdmins(db)) <= 1) {
        throw verr("noDeactivateLastTechAdmin");
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
  opts: { allowEmpty?: boolean } = {},
) {
  const actorRoles = await assertUserAdmin(actorId, db);
  if (userId === actorId) throw verr("noEditOwnRoles");

  const next = [...new Set(roles)];
  for (const r of next) {
    if (!Object.values(Role).includes(r)) throw verr("unknownRole");
  }
  // لا يمنح الفاعل دوراً أعلى من أعلى أدواره.
  const ceiling = highestRank(actorRoles);
  if (next.some((r) => ROLE_RANK[r] > ceiling)) {
    throw aerr("noRoleAboveYours");
  }

  const target = await db.user.findUnique({ where: { id: userId }, select: { roles: true, isActive: true } });
  if (!target) throw verr("userNotFound");

  // حصر الوظائف (و١): من يحمل وظيفة مدّكرٍ لا يحمل دوراً عامّاً. ودورٌ واحدٌ على الأقلّ من النوعين
  // معاً (لا يُحفظ مستخدمٌ بلا أيّ دور). opts.allowEmpty للمنسّق (setRolesAndStaff) حين تُسنَد وظيفةٌ
  // في الحفظ نفسه بعد تصفير الأدوار العامّة.
  const currentStaff = await activeStaffRoles(db, userId);
  assertMuddakirExclusivity(next, currentStaff);
  if (!opts.allowEmpty && next.length === 0 && currentStaff.length === 0) {
    throw verr("atLeastOneRoleOrStaff");
  }

  // نزع آخر مدير تقنيّ فعّال ⟵ يُمنع (إقفال النظام).
  const wasTech = target.isActive && target.roles.includes(Role.TECH_ADMIN);
  const staysTech = next.includes(Role.TECH_ADMIN);
  if (wasTech && !staysTech && (await countActiveTechAdmins(db)) <= 1) {
    throw verr("noRemoveLastTechAdmin");
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

export interface SetRolesAndStaffResult { roles: Role[]; muddakirApplied: MuddakirStaffRole[] }

/**
 * يضبط الأدوار العامّة ووظيفة المدّكر معاً في حفظٍ واحد (نافذة الأدوار). يفرض حصر الوظائف (و١) على
 * الحالة النهائيّة، ثمّ يطبّق بترتيبٍ يتجاوز دورة الحُرّاس: يُنهي الزائد من الوظائف، ثمّ يضبط الأدوار
 * العامّة (تُصفَّر قبل الإسناد إن صار موظّف مدّكر)، ثمّ يُسند الوظيفة الجديدة. للمدير المباشر (مدير المنصّة).
 */
export async function setRolesAndStaff(
  actorId: string,
  userId: string,
  roles: Role[],
  muddakirStaff: MuddakirStaffRole[],
  db: PrismaClient = prisma,
): Promise<SetRolesAndStaffResult> {
  const finalRoles = [...new Set(roles)];
  const finalStaff = [...new Set(muddakirStaff)];
  assertMuddakirExclusivity(finalRoles, finalStaff);
  if (finalRoles.length === 0 && finalStaff.length === 0) {
    throw verr("atLeastOneRoleOrStaff");
  }
  const current = await activeStaffRoles(db, userId);
  const toEnd = current.filter((r) => !finalStaff.includes(r));
  const toAssign = finalStaff.filter((r) => !current.includes(r));
  for (const role of toEnd) await endStaff({ actorUserId: actorId, targetUserId: userId, role }, db);
  const updated = await setRoles(actorId, userId, finalRoles, db, { allowEmpty: finalStaff.length > 0 });
  for (const role of toAssign) await assignStaff({ actorUserId: actorId, targetUserId: userId, role }, db);
  return { roles: updated.roles, muddakirApplied: finalStaff };
}

// ═══════════════ إعادة تعيين كلمة السرّ ═══════════════

export async function resetPassword(
  actorId: string,
  userId: string,
  db: PrismaClient = prisma,
): Promise<{ activationUrl: string }> {
  await assertUserAdmin(actorId, db);
  const target = await db.user.findUnique({ where: { id: userId }, select: { authId: true } });
  if (!target) throw verr("userNotFound");
  if (!target.authId) throw verr("userNoLoginNoPassword");

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
  if (!link) throw verr("invalidActivationLink");
  if (link.usedAt) throw verr("activationLinkUsed");
  if (link.expiresAt.getTime() < Date.now()) throw verr("activationLinkExpired");
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
    throw verr("passwordMinEight");
  }
  const link = await db.activationLink.findUnique({
    where: { token },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!link) throw verr("invalidActivationLink");
  if (link.usedAt) throw verr("activationLinkUsed");
  if (link.expiresAt.getTime() < Date.now()) throw verr("activationLinkExpired");

  const user = await db.user.findUnique({ where: { id: link.userId }, select: { authId: true } });
  if (!user?.authId) throw verr("userNoLogin");

  await provider.setPassword({ authId: user.authId, password });

  // إبطالٌ محميٌّ من السباق: لا يُبطل إلا إن كان لم يُستعمل بعد.
  const marked = await db.activationLink.updateMany({
    where: { id: link.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (marked.count === 0) throw verr("activationLinkUsed");

  await emitEvent(db, {
    type: "USER_ACTIVATED",
    subjectType: "User",
    subjectId: link.userId,
    actorId: link.userId,
  });
}
