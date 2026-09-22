import {
  ApprovalKind,
  ApprovalStatus,
  ProgramKey,
  ProgressState,
  Role,
  StageKind,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { canExamine } from "./examiner-eligibility";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ إجازة اختبار المرحلة (البند ١ — MARAQI_RULES «اختبار المرحلة والإجازة») ═══════════════
//
// حين يُتمّ الطالب كل أحزاب مرحلته الأصليّة (كلها COMPLETED)، تبدأ إجازةٌ تلقائيّة: ٧ أيّامٍ
// تقويميّة (شاملةً العطلة، كأيام جلسات الاختبار — استثناء الحكم ٣). للمعلّم أن يؤجّل مرّةً
// واحدة (+٧)، والتأجيل المتكرّر بيد الإدارة (+٧ لكلٍّ). لا حالة ProgressState جديدة — «في
// إجازة» تُشتقّ من سطر StageExamLeave الذي لم تنقضِ مهلته. لا يمسّ منطق الحصاد/الانتقال القائم.

const DAY_MS = 86_400_000;
export const STAGE_EXAM_LEAVE_DAYS = 7;
export const STAGE_EXAM_DEFER_DAYS = 7;
const ADMIN_ROLES: readonly Role[] = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.TECH_ADMIN];

// ─────────── دوالُّ نقيّة ───────────

/** يُرجع التاريخ فقط (منتصف الليل UTC) من لحظةٍ ما — ليطابق تخزين @db.Date. */
export function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** يضيف n يومًا تقويميًّا (شاملةً العطلة — كأيام جلسات الاختبار). */
export function addCalendarDays(d: Date, n: number): Date {
  return new Date(toUtcDateOnly(d).getTime() + n * DAY_MS);
}

/** المُحتسب: الأساس + تأجيل المعلّم (٧ إن وُجد) + تأجيلات الإدارة (٧ لكلٍّ). دالّةٌ نقيّة. */
export function computeEffectiveEndsOn(
  baseEndsOn: Date,
  teacherDeferredOnce: boolean,
  adminDeferrals: number,
): Date {
  const rounds = (teacherDeferredOnce ? 1 : 0) + Math.max(0, adminDeferrals);
  return addCalendarDays(baseEndsOn, rounds * STAGE_EXAM_DEFER_DAYS);
}

/** true إن كان في الأدوار دورُ إدارةٍ يجيز التأجيل المتكرّر. */
export function isAdminRole(roles: Role[]): boolean {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ─────────── البدء التلقائيّ (داخل معاملة الحصاد) ───────────

/**
 * يبدأ إجازة اختبار المرحلة تلقائيًّا إن اكتمل بهذا الحزب آخرُ أحزاب مرحلته الأصليّة (كلها
 * COMPLETED). يُستدعى داخل معاملة recordHasad (عبر autoTransitionSubStage). idempotent:
 * إجازةٌ واحدةٌ لكل (طالب، مرحلة). لا يفعل شيئًا لغير المرحلة الفرعية أو لمرحلةٍ لم تكتمل.
 */
export async function maybeStartStageExamLeave(
  tx: Prisma.TransactionClient,
  args: { studentId: string; completedStageId: string; actorId: string },
): Promise<void> {
  const stage = await tx.stage.findUnique({
    where: { id: args.completedStageId },
    select: { kind: true, parentId: true },
  });
  if (!stage || stage.kind !== StageKind.SUB_STAGE || !stage.parentId) return;
  const mainStageId = stage.parentId;

  const siblings = await tx.stage.findMany({
    where: { parentId: mainStageId, kind: StageKind.SUB_STAGE },
    select: { id: true },
  });
  if (siblings.length === 0) return;
  const completed = await tx.stageProgress.count({
    where: {
      studentId: args.studentId,
      stageId: { in: siblings.map((s) => s.id) },
      state: ProgressState.COMPLETED,
    },
  });
  if (completed < siblings.length) return; // ما زال في المرحلة أحزابٌ غير مكتملة

  const existing = await tx.stageExamLeave.findUnique({
    where: { studentId_mainStageId: { studentId: args.studentId, mainStageId } },
    select: { id: true },
  });
  if (existing) return; // بدأت الإجازة سلفًا — لا تكرار

  const startedOn = toUtcDateOnly(new Date());
  const baseEndsOn = addCalendarDays(startedOn, STAGE_EXAM_LEAVE_DAYS);
  await tx.stageExamLeave.create({
    data: { studentId: args.studentId, mainStageId, startedOn, baseEndsOn, effectiveEndsOn: baseEndsOn },
  });
  await emitEvent(tx, {
    type: "STAGE_EXAM_LEAVE_STARTED",
    subjectType: "Student",
    subjectId: args.studentId,
    actorId: args.actorId,
    payload: { mainStageId, baseEndsOn: iso(baseEndsOn) },
  });
}

// ─────────── التأجيل ───────────

export interface DeferStageExamArgs {
  studentId: string;
  actorId: string;
  actorRoles: Role[];
  mainStageId?: string; // إن غاب: أحدث إجازةٍ للطالب
}

export interface DeferStageExamResult {
  leaveId: string;
  mainStageId: string;
  teacherDeferredOnce: boolean;
  adminDeferrals: number;
  effectiveEndsOn: string; // YYYY-MM-DD
}

/**
 * تأجيل دخول الطالب للاختبار أسبوعًا (+٧ أيّام تقويميّة). المعلّم مرّةً واحدة فقط؛ والتأجيل
 * المتكرّر (أيّ تأجيلٍ بعد الأوّل) يتطلّب دور إدارة (CIRCLE_MANAGER/SUPER_ADMIN/TECH_ADMIN)
 * بلا حدّ. القاعدة مطلقةٌ في الخادم (لا تُحتسب البوّابة على الواجهة).
 */
export async function deferStageExam(
  args: DeferStageExamArgs,
  db: PrismaClient = prisma,
): Promise<DeferStageExamResult> {
  const leave = args.mainStageId
    ? await db.stageExamLeave.findUnique({
        where: { studentId_mainStageId: { studentId: args.studentId, mainStageId: args.mainStageId } },
      })
    : await db.stageExamLeave.findFirst({
        where: { studentId: args.studentId },
        orderBy: { createdAt: "desc" },
      });
  if (!leave) throw new ValidationError("لا إجازة مرحلة قائمة لهذا الطالب.");

  const admin = isAdminRole(args.actorRoles);
  let teacherDeferredOnce = leave.teacherDeferredOnce;
  let adminDeferrals = leave.adminDeferrals;
  if (admin) {
    adminDeferrals += 1; // الإدارة تؤجّل بلا حدّ
  } else {
    if (leave.teacherDeferredOnce || leave.adminDeferrals > 0) {
      throw new AuthorizationError("التأجيل المتكرّر يحتاج موافقة الإدارة.");
    }
    teacherDeferredOnce = true; // تأجيل المعلّم — مرّةً واحدة
  }
  const effectiveEndsOn = computeEffectiveEndsOn(leave.baseEndsOn, teacherDeferredOnce, adminDeferrals);

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.stageExamLeave.update({
      where: { id: leave.id },
      data: { teacherDeferredOnce, adminDeferrals, effectiveEndsOn },
    });
    await emitEvent(tx, {
      type: "STAGE_EXAM_LEAVE_DEFERRED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.actorId,
      payload: { mainStageId: leave.mainStageId, by: admin ? "ADMIN" : "TEACHER", teacherDeferredOnce, adminDeferrals },
    });
    return u;
  });

  return {
    leaveId: updated.id,
    mainStageId: updated.mainStageId,
    teacherDeferredOnce: updated.teacherDeferredOnce,
    adminDeferrals: updated.adminDeferrals,
    effectiveEndsOn: iso(updated.effectiveEndsOn),
  };
}

// ─────────── المحفوظ المكتمل (نطاق الاختبار) ───────────

export interface MemorizedHizb {
  stageId: string;
  hizbNumber: number | null;
  label: string;
}

/** كل الأحزاب المكتملة (COMPLETED) للطالب في مراقي — نطاق اختبار المرحلة (كامل المحفوظ). */
async function memorizedHizbs(studentId: string, db: PrismaClient | Prisma.TransactionClient): Promise<MemorizedHizb[]> {
  const rows = await db.stageProgress.findMany({
    where: {
      studentId,
      state: ProgressState.COMPLETED,
      stage: { kind: StageKind.SUB_STAGE, program: { key: ProgramKey.MARAQI } },
    },
    select: { stageId: true, stage: { select: { hizbNumber: true, nameAr: true } } },
    orderBy: { stage: { hizbNumber: "desc" } },
  });
  return rows.map((r) => ({ stageId: r.stageId, hizbNumber: r.stage.hizbNumber, label: r.stage.nameAr }));
}

/** true إن كان للطالب اقتراح انتقال مرحلةٍ معلَّق (يمنع اختبارًا جديدًا). */
async function hasPendingStageTransition(studentId: string, db: PrismaClient | Prisma.TransactionClient): Promise<boolean> {
  const pending = await db.approval.findFirst({
    where: {
      kind: ApprovalKind.STAGE_TRANSITION,
      status: ApprovalStatus.PENDING,
      payload: { path: ["studentId"], equals: studentId },
    },
    select: { id: true },
  });
  return pending !== null;
}

// ─────────── الجاهزون للاختبار (مشتقّة، نمط listReadyForHasad) ───────────

export interface ReadyStageExamStudent {
  studentId: string;
  name: string;
  mainStageId: string;
  mainStageLabel: string;
  effectiveEndsOn: string; // YYYY-MM-DD
  hizbs: MemorizedHizb[]; // كامل المحفوظ — ما يرصده المختبِر حزبًا حزبًا
}

/**
 * الطلاب الجاهزون لاختبار المرحلة، ممّن **يجوز لهذا المختبِر** اختبارهم (الحياد). الاشتقاق:
 * إجازةٌ انقضت مهلتها (effectiveEndsOn ≤ اليوم) + لا اقتراح انتقالٍ معلّق + مختبِرٌ محايد.
 * فارغٌ بأمان. مرتّبٌ بالاسم عربيًّا (نمط listReadyForHasad).
 */
export async function listReadyForStageExam(
  examinerId: string,
  db: PrismaClient = prisma,
): Promise<ReadyStageExamStudent[]> {
  const today = toUtcDateOnly(new Date());
  const leaves = await db.stageExamLeave.findMany({
    where: { effectiveEndsOn: { lte: today } },
    orderBy: { effectiveEndsOn: "asc" },
  });
  const out: ReadyStageExamStudent[] = [];
  for (const lv of leaves) {
    if (await hasPendingStageTransition(lv.studentId, db)) continue;
    if (!(await canExamine({ examinerUserId: examinerId, studentId: lv.studentId }, db))) continue;
    const student = await db.student.findUnique({
      where: { id: lv.studentId },
      select: { user: { select: { nameAsInId: true } } },
    });
    if (!student) continue;
    const stage = await db.stage.findUnique({ where: { id: lv.mainStageId }, select: { nameAr: true } });
    out.push({
      studentId: lv.studentId,
      name: student.user.nameAsInId,
      mainStageId: lv.mainStageId,
      mainStageLabel: stage?.nameAr ?? "—",
      effectiveEndsOn: iso(lv.effectiveEndsOn),
      hizbs: await memorizedHizbs(lv.studentId, db),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/**
 * البوّابة المطلقة قبل تسجيل اختبار المرحلة (يُدعى في المسار قبل recordStageExam، الذي لا
 * يُعدَّل): (١) لا اختبار بلا إجازةٍ للطالب على هذه المرحلة؛ (٢) لا اختبار قبل انقضاء مهلتها؛
 * (٣) لا اختبار لمن له اقتراح انتقالٍ معلّق. (الحياد يضمنه recordStageExam نفسه.)
 */
export async function assertReadyForStageExam(
  args: { studentId: string; mainStageId: string },
  db: PrismaClient = prisma,
): Promise<void> {
  const leave = await db.stageExamLeave.findUnique({
    where: { studentId_mainStageId: { studentId: args.studentId, mainStageId: args.mainStageId } },
  });
  if (!leave) throw new ValidationError("لا إجازة مرحلة — لم يُتمّ الطالب مرحلته أو لم تبدأ إجازته.");
  const today = toUtcDateOnly(new Date());
  if (leave.effectiveEndsOn.getTime() > today.getTime()) {
    throw new ValidationError("إجازة المرحلة لم تنقضِ بعد — لا اختبار قبل انقضائها.");
  }
  if (await hasPendingStageTransition(args.studentId, db)) {
    throw new ValidationError("للطالب اقتراح انتقالٍ معلّق — لا اختبار جديد.");
  }
}

// ─────────── في الإجازة (مؤشّر المعلّم + التأجيل) ───────────

export interface OnLeaveStudent {
  studentId: string;
  name: string;
  mainStageId: string;
  mainStageLabel: string;
  startedOn: string;
  effectiveEndsOn: string;
  teacherDeferredOnce: boolean;
  adminDeferrals: number;
  canDefer: boolean; // للواجهة: هل يجوز لهذا الفاعل تأجيلها الآن
}

/**
 * الطلاب في إجازة اختبار المرحلة (لم تنقضِ مهلتها) — لمؤشّر المعلّم/الإدارة وزرّ التأجيل.
 * المعلّم يرى طلاب حلقاته فقط؛ الإدارة ترى الجميع. canDefer يعكس قاعدة التأجيل المطلقة.
 */
export async function listOnLeaveForStaff(
  args: { userId: string; roles: Role[] },
  db: PrismaClient = prisma,
): Promise<OnLeaveStudent[]> {
  const today = toUtcDateOnly(new Date());
  const admin = isAdminRole(args.roles);
  let studentFilter: Prisma.StageExamLeaveWhereInput = {};
  if (!admin) {
    const circles = await db.circleTeacher.findMany({ where: { teacherId: args.userId }, select: { circleId: true } });
    if (circles.length === 0) return [];
    const enr = await db.enrollment.findMany({
      where: { circleId: { in: circles.map((c) => c.circleId) }, endedAt: null },
      select: { studentId: true },
    });
    const ids = [...new Set(enr.map((e) => e.studentId))];
    if (ids.length === 0) return [];
    studentFilter = { studentId: { in: ids } };
  }
  const leaves = await db.stageExamLeave.findMany({
    where: { effectiveEndsOn: { gt: today }, ...studentFilter },
    orderBy: { effectiveEndsOn: "asc" },
  });
  const out: OnLeaveStudent[] = [];
  for (const lv of leaves) {
    const student = await db.student.findUnique({
      where: { id: lv.studentId },
      select: { user: { select: { nameAsInId: true } } },
    });
    if (!student) continue;
    const stage = await db.stage.findUnique({ where: { id: lv.mainStageId }, select: { nameAr: true } });
    out.push({
      studentId: lv.studentId,
      name: student.user.nameAsInId,
      mainStageId: lv.mainStageId,
      mainStageLabel: stage?.nameAr ?? "—",
      startedOn: iso(lv.startedOn),
      effectiveEndsOn: iso(lv.effectiveEndsOn),
      teacherDeferredOnce: lv.teacherDeferredOnce,
      adminDeferrals: lv.adminDeferrals,
      canDefer: admin || (!lv.teacherDeferredOnce && lv.adminDeferrals === 0),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
