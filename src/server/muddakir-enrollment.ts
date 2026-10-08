import {
  MuddakirDeliveryMode,
  MuddakirStaffRole,
  ProgramHistoryReason,
  Role,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { isSupervisorCapable } from "./muddakir-staff";
import { AuthorizationError, ValidationError } from "./errors";
import { closeProgramHistory, recordProgramEntry } from "./program-placement";
import { ensureMuddakirProfile, muddakirProgramId } from "./muddakir-profile";
import { getProgramSetting } from "./settings";

// ═══════════════ المُدَّكِر — الإلحاق والإسناد (المرحلة ٣) ═══════════════
//
// الإلحاق: Enrollment بـprogramId=المُدَّكِر (يُبقي حلقة الطالب نفسها، نمط applyDueOn) + ملفٌّ
// افتراضيّ، idempotent. الإسناد: MuddakirSupervision بسقف maxHafizPerSupervisor من Setting،
// مفروضٌ في الخادم بقفلٍ متبادلٍ (advisory) آمنٍ من التسابق. إعادة الإسناد تُنهي السابق (لا حذف).

// ── الصلاحيّات (§٢) ──
// إدارة المُدَّكِر (إلحاق/إسناد): المدير فقط — SUPER_ADMIN أو CIRCLE_MANAGER. المشرف (ARIF) يرى
// حفّاظه للقراءة فقط. الحرّاس نقيّون (يأخذون أدوار المستخدم) ليُختبروا وتستدعيهما الصفحة/الإجراء.
const MANAGE_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

export function canManageMuddakir(roles: readonly Role[]): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}

/** يرمي إن لم يكن المستخدم مديرًا (لإلحاق/إسناد). */
export function assertCanManageMuddakir(roles: readonly Role[]): void {
  if (!canManageMuddakir(roles)) throw new AuthorizationError("غير مصرَّح بإدارة المُدَّكِر.");
}

/** هل يرى المستخدم عرض المُدَّكِر؟ مديرٌ (كامل) أو مشرفٌ ARIF (حفّاظه للقراءة فقط). */
export function canViewMuddakir(roles: readonly Role[]): boolean {
  return canManageMuddakir(roles) || roles.includes(Role.ARIF);
}

export function assertCanViewMuddakir(roles: readonly Role[]): void {
  if (!canViewMuddakir(roles)) throw new AuthorizationError("غير مصرَّح بعرض المُدَّكِر.");
}

// ── الإلحاق ──

export interface EnrollMuddakirArgs {
  studentId: string;
  actorId: string;
  deliveryMode?: MuddakirDeliveryMode; // يحدّده المدير؛ الافتراضيّ IN_PERSON
}

export interface EnrollMuddakirResult {
  enrollmentId: string;
  alreadyEnrolled: boolean;
}

/**
 * يُلحق حافظًا ببرنامج المُدَّكِر: ينهي قيده النشط (إن كان ببرنامجٍ آخر) ويُنشئ قيدًا جديدًا
 * بالحلقة نفسها وprogramId=المُدَّكِر، ويضمن ملفَّه الافتراضيّ. idempotent: إن كان ملتحقًا فعلًا
 * لا يكرّر قيدًا ولا ملفًّا.
 */
export async function enrollInMuddakir(
  args: EnrollMuddakirArgs,
  db: PrismaClient = prisma,
): Promise<EnrollMuddakirResult> {
  const student = await db.student.findUnique({ where: { id: args.studentId }, select: { id: true } });
  if (!student) throw new ValidationError("الحافظ غير موجود.");
  const programId = await muddakirProgramId(db);

  return db.$transaction(async (tx) => {
    const active = await tx.enrollment.findFirst({
      where: { studentId: args.studentId, endedAt: null },
      select: { id: true, circleId: true, programId: true },
    });

    // ملتحقٌ بالمُدَّكِر فعلًا ⟵ idempotent: اضمن الملفّ فقط، بلا قيدٍ جديد.
    if (active?.programId === programId) {
      await ensureMuddakirProfile(tx, args.studentId);
      if (args.deliveryMode) {
        await tx.muddakirProfile.update({ where: { studentId: args.studentId }, data: { deliveryMode: args.deliveryMode } });
      }
      return { enrollmentId: active.id, alreadyEnrolled: true };
    }

    const circleId = active?.circleId;
    if (!circleId) throw new ValidationError("الحافظ بلا حلقة؛ أسنده لحلقةٍ أوّلًا.");

    if (active) {
      await tx.enrollment.update({ where: { id: active.id }, data: { endedAt: new Date() } });
      await closeProgramHistory(tx, args.studentId);
    }
    const created = await tx.enrollment.create({ data: { studentId: args.studentId, circleId, programId } });
    await ensureMuddakirProfile(tx, args.studentId);
    if (args.deliveryMode) {
      await tx.muddakirProfile.update({ where: { studentId: args.studentId }, data: { deliveryMode: args.deliveryMode } });
    }
    await recordProgramEntry(tx, {
      studentId: args.studentId,
      programId,
      reason: active ? ProgramHistoryReason.CHANGE : ProgramHistoryReason.ASSIGNMENT,
      actorId: args.actorId,
    });
    await emitEvent(tx, {
      type: "MUDDAKIR_ENROLLED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.actorId,
      payload: { enrollmentId: created.id },
    });
    return { enrollmentId: created.id, alreadyEnrolled: false };
  });
}

// ── الإسناد للمشرف ──

const MAX_HAFIZ_KEY = "maxHafizPerSupervisor";
const DEFAULT_MAX_HAFIZ = 4;

/** سقف الحفّاظ للمشرف من Setting (افتراضيّ ٤) — لا قيمة مكتوبة في المنطق. */
async function maxHafizPerSupervisor(programId: string, db: PrismaClient | Prisma.TransactionClient): Promise<number> {
  const v = await getProgramSetting(programId, MAX_HAFIZ_KEY, db as PrismaClient);
  return typeof v === "number" && v > 0 ? v : DEFAULT_MAX_HAFIZ;
}

/**
 * يُسند حافظًا لمشرفٍ (ARIF) في MuddakirSupervision، بسقف maxHafizPerSupervisor مفروضٍ **في الخادم
 * داخل معاملة آمنة من التسابق**: قفلٌ متبادلٌ (pg_advisory_xact_lock) على المشرف يُسلسِل الطلبات
 * المتزامنة، فطلبان على مشرفٍ عنده ٣ لا يتجاوزان ٤. إعادة الإسناد تُنهي الإسناد السابق للحافظ
 * (endedAt) ولا تحذفه.
 */
export async function assignSupervisor(
  args: { studentId: string; supervisorId: string; actorId: string },
  db: PrismaClient = prisma,
): Promise<{ supervisionId: string }> {
  const supervisor = await db.user.findUnique({ where: { id: args.supervisorId }, select: { id: true } });
  if (!supervisor || !(await isSupervisorCapable(db, args.supervisorId))) {
    throw new ValidationError("المشرف يجب أن يكون مشرفًا (ARIF) أو مشرفَ مدّكرٍ مُسنَداً.");
  }
  const profile = await db.muddakirProfile.findUnique({ where: { studentId: args.studentId }, select: { studentId: true } });
  if (!profile) throw new ValidationError("الحافظ غير ملتحقٍ بالمُدَّكِر.");
  const programId = await muddakirProgramId(db);
  const max = await maxHafizPerSupervisor(programId, db);

  return db.$transaction(async (tx) => {
    // قفلٌ متبادلٌ على المشرف: يُسلسِل كلّ إسنادٍ له فيُفرَض السقف بلا تسابق.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${args.supervisorId})::bigint)`);

    // إعادة الإسناد: أنهِ أي إسنادٍ نشطٍ سابقٍ للحافظ (لا حذف) — ويحفظ قيد «نشطٌ واحدٌ لكلّ حافظ».
    await tx.muddakirSupervision.updateMany({
      where: { studentId: args.studentId, endedAt: null },
      data: { endedAt: new Date() },
    });

    // حمل المشرف الهدف الآن (بعد إنهاء السابق للحافظ، فلا يُحسب مرّتين).
    const load = await tx.muddakirSupervision.count({ where: { supervisorId: args.supervisorId, endedAt: null } });
    if (load >= max) throw new ValidationError(`بلغ المشرف سقفه الأقصى (${max}).`);

    const created = await tx.muddakirSupervision.create({
      data: { studentId: args.studentId, supervisorId: args.supervisorId },
      select: { id: true },
    });
    await emitEvent(tx, {
      type: "MUDDAKIR_SUPERVISOR_ASSIGNED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.actorId,
      payload: { supervisorId: args.supervisorId },
    });
    return { supervisionId: created.id };
  });
}

// ── قراءات الشاشة ──

export interface HafizRow {
  studentId: string;
  name: string;
  stage: number; // رقم المرحلة المشتقّة (من currentStageId)
  supervisorId: string | null;
  supervisorName: string | null;
  deliveryMode: MuddakirDeliveryMode;
}

// جداول المُدَّكِر بلا FK (نصّيّة)، فتُجلب الأسماء باستعلاماتٍ منفصلة بالمعرّفات.
async function namesByStudentId(db: PrismaClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.student.findMany({ where: { id: { in: ids } }, select: { id: true, user: { select: { nameAsInId: true } } } });
  return new Map(rows.map((r) => [r.id, r.user.nameAsInId]));
}
async function namesByUserId(db: PrismaClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, nameAsInId: true } });
  return new Map(rows.map((r) => [r.id, r.nameAsInId]));
}

/** قائمة حفّاظ المُدَّكِر: الاسم والمرحلة والمشرف النشط ونمط اللقاء. */
export async function listMuddakirHafiz(db: PrismaClient = prisma): Promise<HafizRow[]> {
  const profiles = await db.muddakirProfile.findMany({
    select: { studentId: true, currentStageId: true, deliveryMode: true },
  });
  const studentIds = profiles.map((p) => p.studentId);
  const sups = await db.muddakirSupervision.findMany({
    where: { studentId: { in: studentIds }, endedAt: null },
    select: { studentId: true, supervisorId: true },
  });
  const byStudent = new Map(sups.map((s) => [s.studentId, s.supervisorId]));
  const studentNames = await namesByStudentId(db, studentIds);
  const supNames = await namesByUserId(db, [...new Set(sups.map((s) => s.supervisorId))]);
  return profiles
    .map((p) => {
      const supervisorId = byStudent.get(p.studentId) ?? null;
      return {
        studentId: p.studentId,
        name: studentNames.get(p.studentId) ?? "—",
        stage: Number(p.currentStageId ?? "1") || 1,
        supervisorId,
        supervisorName: supervisorId ? (supNames.get(supervisorId) ?? "—") : null,
        deliveryMode: p.deliveryMode,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export interface SupervisorRow {
  id: string;
  name: string;
  load: number;
  max: number;
  full: boolean;
}

/** المشرفون (ARIF أو مشرفو المدّكر المُسنَدون) مع حِمل كلٍّ والسقف — لاختيار المشرف في الشاشة. */
export async function listSupervisorsWithLoad(db: PrismaClient = prisma): Promise<SupervisorRow[]> {
  const programId = await muddakirProgramId(db);
  const max = await maxHafizPerSupervisor(programId, db);
  const arifs = await db.user.findMany({ where: { roles: { has: Role.ARIF }, isActive: true }, select: { id: true, nameAsInId: true } });
  // مشرفو المدّكر الخاصّون (SUPERVISOR) — نشطون، ممّن ليسوا ARIF أصلاً.
  const staff = await db.muddakirStaff.findMany({ where: { role: MuddakirStaffRole.SUPERVISOR, endedAt: null }, select: { userId: true } });
  const staffIds = [...new Set(staff.map((s) => s.userId))].filter((id) => !arifs.some((a) => a.id === id));
  const staffUsers = staffIds.length ? await db.user.findMany({ where: { id: { in: staffIds }, isActive: true }, select: { id: true, nameAsInId: true } }) : [];
  const supervisors = [...arifs, ...staffUsers];
  const counts = await db.muddakirSupervision.groupBy({
    by: ["supervisorId"],
    where: { endedAt: null, supervisorId: { in: supervisors.map((s) => s.id) } },
    _count: { _all: true },
  });
  const loadBy = new Map(counts.map((c) => [c.supervisorId, c._count._all]));
  return supervisors
    .map((s) => {
      const load = loadBy.get(s.id) ?? 0;
      return { id: s.id, name: s.nameAsInId, load, max, full: load >= max };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** الحفّاظ المتاحون للإلحاق: من له قيدٌ نشطٌ ببرنامجٍ غير المُدَّكِر (فله حلقةٌ تُعاد). */
export async function listEnrollableStudents(db: PrismaClient = prisma): Promise<{ studentId: string; name: string }[]> {
  const programId = await muddakirProgramId(db);
  const active = await db.enrollment.findMany({
    where: { endedAt: null, programId: { not: programId } },
    select: { studentId: true },
  });
  const ids = [...new Set(active.map((e) => e.studentId))];
  const names = await namesByStudentId(db, ids);
  return ids
    .map((id) => ({ studentId: id, name: names.get(id) ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** حفّاظ مشرفٍ معيّن (للقراءة فقط في عرض المشرف). */
export async function listHafizForSupervisor(supervisorId: string, db: PrismaClient = prisma): Promise<HafizRow[]> {
  const sups = await db.muddakirSupervision.findMany({
    where: { supervisorId, endedAt: null },
    select: { studentId: true },
  });
  const studentIds = sups.map((s) => s.studentId);
  if (!studentIds.length) return [];
  const profiles = await db.muddakirProfile.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, currentStageId: true, deliveryMode: true },
  });
  const profileBy = new Map(profiles.map((p) => [p.studentId, p]));
  const studentNames = await namesByStudentId(db, studentIds);
  const supName = (await namesByUserId(db, [supervisorId])).get(supervisorId) ?? "—";
  return studentIds
    .map((studentId) => {
      const p = profileBy.get(studentId);
      return {
        studentId,
        name: studentNames.get(studentId) ?? "—",
        stage: Number(p?.currentStageId ?? "1") || 1,
        supervisorId,
        supervisorName: supName,
        deliveryMode: p?.deliveryMode ?? MuddakirDeliveryMode.IN_PERSON,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
