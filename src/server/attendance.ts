import {
  ApprovalKind,
  ApprovalStatus,
  AttendanceStatus,
  ProgressState,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { assertCapability } from "./authz";
import { decide } from "./approval";
import { emitEvent } from "./events";
import { notifyAbsence } from "./guardian-messages";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ الحضور والقياس (م٢ — DESIGN §١٠ و§١١) ═══════════════
//
// الرصد (§١٠٫١): الشاشة تفترض الجميع حاضرين، والمعلم يؤشّر الغائب فقط — فنستقبل
// «الاستثناءات» لا القائمة كاملة، ونشتقّ البقية حضورًا. ويعمل بلا إنترنت ويُزامن:
// السجل مُعرَّفٌ بمفتاح (الطالب، اليوم) فإعادة الإرسال idempotent (لا تكرار، لا عدٌّ مضاعف).
//
// القياس (§١١٫٤): «أيام الحضور» لا أيام التقويم. الحالات التي تُحتسب يوم حضور:
// حاضر + متأخر + خرج مبكرًا (أيّ حضورٍ فعليّ نال نصيبًا من الجلسة). الغياب بنوعيه
// والاستئذان لا يُحتسبان. العدّاد يقع على المرحلة الجارية (StageProgress.attendanceDays).
//
// العذر والاستئذان (§١٠٫٢): إجراءان بدورة حياة عبر محرّك الاعتمادات (ABSENCE_EXCUSE)،
// لا حالتان يؤشّرهما المعلم. القبول حسب التفويض (§٣٫٣)، وكلّ قبولٍ يُسجَّل بصاحبه
// (قاعدة مطلقة §١٠٫٢: من يملك تحويل «غائب» إلى «معذور» يملك تجميل أرقام القياس).

/** الحالات التي تُحتسب «يوم حضور» في القياس (§١١٫٤ — قرار: أيّ حضورٍ فعليّ). */
export const COUNTED_STATUSES: ReadonlySet<AttendanceStatus> = new Set([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.LEFT_EARLY,
]);

/** لا عتبات مخترعة (§١١٫١): التنبيه على الشريحة العليا معطَّل حتى ٢٠ إتمامًا للباب. */
export const PEER_ALERT_MIN_COMPLETIONS = 20;

const isCounted = (s: AttendanceStatus) => COUNTED_STATUSES.has(s);

/** يحوّل مدخلًا (نص ISO أو Date) إلى تاريخٍ بلا وقت (منتصف ليل UTC) — يطابق @db.Date. */
export function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) throw new ValidationError("تاريخ غير صالح.");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** يمثّل التاريخ نصًّا YYYY-MM-DD (لمقارنة حمولات الاعتماد). */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ═══════════════ حدود الرصد في الخادم ═══════════════

/**
 * المعلم يرصد حلقاته فقط (§٣٫٢). المدير/المشرف يرصد أي حلقة (أصل الصلاحية).
 * معلمٌ لحلقةٍ ليست له ← يُرفض في الخادم (لا في الواجهة).
 */
export async function assertCanRecordCircle(
  actorId: string,
  circleId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { roles: true },
  });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) {
    return;
  }
  const link = await db.circleTeacher.findFirst({
    where: { circleId, teacherId: actorId, endedAt: null },
    select: { circleId: true },
  });
  if (!link) {
    throw new AuthorizationError("لا تَرصد إلا حلقاتك (§٣٫٢).");
  }
}

/** صاحب الطلب طالبٌ عن نفسه أو وليٌّ مرتبطٌ به (§١٠٫٢: الطالب/الولي يقدّم). */
async function assertStudentOrGuardian(
  actorId: string,
  studentId: string,
  db: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { userId: true },
  });
  if (!student) throw new ValidationError("طالب غير موجود.");
  if (student.userId === actorId) return;
  const link = await db.guardianLink.findFirst({
    where: { studentId, guardianId: actorId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!link) {
    throw new AuthorizationError("الاستئذان يقدّمه الطالب أو وليّه فقط (§١٠٫٢).");
  }
}

// ═══════════════ عدّاد أيام الحضور — بالانتقال (idempotent) ═══════════════

/**
 * يطبّق فرق يومٍ واحد (±١) على المراحل الجارية للطالب. الفرق يُحسب بانتقال الحالة
 * (حُوسِبت ← لم تُحسب)، فإعادة الرصد بالحالة نفسها = صفر (لا عدٌّ مضاعف عند المزامنة).
 */
async function applyAttendanceDayDelta(
  db: Prisma.TransactionClient,
  studentId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const rows = await db.stageProgress.findMany({
    where: { studentId, state: ProgressState.IN_PROGRESS },
    select: { id: true, attendanceDays: true },
  });
  for (const r of rows) {
    await db.stageProgress.update({
      where: { id: r.id },
      data: { attendanceDays: Math.max(0, r.attendanceDays + delta) },
    });
  }
}

/**
 * يُثبت حالة حضورٍ ليوم (upsert بمفتاح الطالب+اليوم) ويحرّك العدّاد بالانتقال.
 * يُستدعى داخل معاملة. يعيد الحالة السابقة (أو null إن أُنشئ السجل الآن).
 */
async function upsertAttendance(
  tx: Prisma.TransactionClient,
  args: {
    studentId: string;
    circleId: string;
    date: Date;
    status: AttendanceStatus;
    recordedBy: string;
    note?: string | null;
    excuseAcceptedBy?: string | null;
    excuseAcceptedAt?: Date | null;
  },
): Promise<AttendanceStatus | null> {
  const existing = await tx.attendance.findUnique({
    where: { studentId_date: { studentId: args.studentId, date: args.date } },
    select: { status: true },
  });

  const base = {
    status: args.status,
    circleId: args.circleId,
    recordedBy: args.recordedBy,
    ...(args.note !== undefined ? { note: args.note } : {}),
    ...(args.excuseAcceptedBy !== undefined ? { excuseAcceptedBy: args.excuseAcceptedBy } : {}),
    ...(args.excuseAcceptedAt !== undefined ? { excuseAcceptedAt: args.excuseAcceptedAt } : {}),
  };

  await tx.attendance.upsert({
    where: { studentId_date: { studentId: args.studentId, date: args.date } },
    update: base,
    create: { studentId: args.studentId, date: args.date, ...base },
  });

  const prevCounted = existing ? isCounted(existing.status) : false;
  const nextCounted = isCounted(args.status);
  await applyAttendanceDayDelta(
    tx,
    args.studentId,
    Number(nextCounted) - Number(prevCounted),
  );
  return existing?.status ?? null;
}

// ═══════════════ رصد الجلسة — الاستثناء لا القاعدة ═══════════════

export interface AttendanceMark {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
}

export interface RecordSessionArgs {
  circleId: string;
  date: string | Date;
  /** الاستثناءات فقط (الغائب/المتأخر…). البقية تُشتقّ حضورًا. */
  exceptions: AttendanceMark[];
  recorderId: string;
}

export interface RecordSessionResult {
  total: number;
  present: number;
  absent: number;
}

interface PreExcusePayload {
  targetStatus: "PRE_EXCUSED";
  date: string;
  reason: string;
}

/**
 * يرصد جلسة حلقةٍ ليوم. المعلم يرسل الاستثناءات، والخادم يشتقّ البقية حضورًا،
 * ويطبّق «مستأذن مسبقًا» المعتمَد تلقائيًّا (تحويلٌ كسول عند حلول اليوم — لا مجدول).
 * idempotent: مفتاح (الطالب، اليوم) + عدٌّ بالانتقال ⟵ إعادة الإرسال بلا أثرٍ مضاعف.
 */
export async function recordSession(
  args: RecordSessionArgs,
  db: PrismaClient = prisma,
): Promise<RecordSessionResult> {
  const date = toDateOnly(args.date);
  await assertCanRecordCircle(args.recorderId, args.circleId, db);

  // قائمة الحلقة = المنتسبون نشطًا (endedAt = null).
  const enrollments = await db.enrollment.findMany({
    where: { circleId: args.circleId, endedAt: null },
    select: { studentId: true },
  });
  const roster = new Set(enrollments.map((e) => e.studentId));
  if (roster.size === 0) {
    throw new ValidationError("لا طلاب منتسبين لهذه الحلقة.");
  }

  // كل استثناءٍ لطالبٍ من الحلقة (رصد غريبٍ ← يُرفض).
  const marks = new Map<string, AttendanceMark>();
  for (const m of args.exceptions) {
    if (!roster.has(m.studentId)) {
      throw new ValidationError("رصدُ طالبٍ ليس من الحلقة.");
    }
    if (!Object.values(AttendanceStatus).includes(m.status)) {
      throw new ValidationError("حالة حضورٍ غير معروفة.");
    }
    marks.set(m.studentId, m);
  }

  // «مستأذن مسبقًا» المعتمَد لهذا اليوم (تحويلٌ كسول) — لمن لم يُرصد استثناءً صريحًا.
  const dk = dateKey(date);
  const approvedPreExcuses = await db.approval.findMany({
    where: {
      kind: ApprovalKind.ABSENCE_EXCUSE,
      status: ApprovalStatus.APPROVED,
      subjectId: { in: [...roster] },
    },
    select: { subjectId: true, decidedBy: true, payload: true },
  });
  const preExcuse = new Map<string, { by: string | null; reason: string }>();
  for (const a of approvedPreExcuses) {
    const p = a.payload as unknown as PreExcusePayload | null;
    if (p?.targetStatus === "PRE_EXCUSED" && p.date === dk) {
      preExcuse.set(a.subjectId, { by: a.decidedBy, reason: p.reason });
    }
  }

  let absent = 0;
  await db.$transaction(async (tx) => {
    for (const studentId of roster) {
      const mark = marks.get(studentId);
      const pre = preExcuse.get(studentId);

      let status: AttendanceStatus;
      let note: string | null | undefined;
      let excuseBy: string | null | undefined;
      let excuseAt: Date | null | undefined;

      if (mark) {
        status = mark.status;
        note = mark.note ?? null;
      } else if (pre) {
        status = AttendanceStatus.PRE_EXCUSED;
        note = pre.reason;
        excuseBy = pre.by;
        excuseAt = new Date();
      } else {
        status = AttendanceStatus.PRESENT;
        note = null;
      }

      if (!isCounted(status)) absent += 1;

      await upsertAttendance(tx, {
        studentId,
        circleId: args.circleId,
        date,
        status,
        recordedBy: args.recorderId,
        note,
        ...(excuseBy !== undefined ? { excuseAcceptedBy: excuseBy } : {}),
        ...(excuseAt !== undefined ? { excuseAcceptedAt: excuseAt } : {}),
      });
    }

    await emitEvent(tx, {
      type: "ATTENDANCE_RECORDED",
      subjectType: "Circle",
      subjectId: args.circleId,
      actorId: args.recorderId,
      payload: { date: dk, total: roster.size, absent },
    });
  });

  // تنبيه وليّ الأمر بالغياب غير المبرَّر فقط (الفكرة ٩) — بعد الرصد، بلا تعطيلٍ إن فشل.
  for (const m of marks.values()) {
    if (m.status === AttendanceStatus.ABSENT_UNEXCUSED) {
      try { await notifyAbsence(m.studentId, dk, db); } catch { /* التنبيه إضافةٌ لا تُعطّل الرصد */ }
    }
  }

  return { total: roster.size, present: roster.size - absent, absent };
}

export interface RecordableCircle {
  id: string;
  nameAr: string;
}

/** الحلقات التي يحقّ للفاعل رصدها: المعلم حلقاته، والمدير/المشرف كلّها (§٣٫٢). */
export async function listRecordableCircles(
  actorId: string,
  db: PrismaClient = prisma,
): Promise<RecordableCircle[]> {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { roles: true },
  });
  if (!actor) return [];
  if (actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) {
    return db.circle.findMany({
      select: { id: true, nameAr: true },
      orderBy: { nameAr: "asc" },
    });
  }
  const links = await db.circleTeacher.findMany({
    where: { teacherId: actorId, endedAt: null },
    select: { circle: { select: { id: true, nameAr: true } } },
  });
  return links.map((l) => l.circle).sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}

// ═══════════════ عرض قائمة الرصد (للشاشة) ═══════════════

export interface RosterRow {
  studentId: string;
  name: string;
  status: AttendanceStatus;
  note: string | null;
}

/** قائمة الحلقة ليومٍ مع الحالة المسجَّلة (أو حاضر افتراضًا) — لملء الشاشة. */
export async function getSessionRoster(
  circleId: string,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<RosterRow[]> {
  const d = toDateOnly(date);
  const enrollments = await db.enrollment.findMany({
    where: { circleId, endedAt: null },
    select: { student: { select: { id: true, user: { select: { nameAsInId: true } } } } },
  });
  const rows = await db.attendance.findMany({
    where: { circleId, date: d },
    select: { studentId: true, status: true, note: true },
  });
  const byStudent = new Map(rows.map((r) => [r.studentId, r]));
  return enrollments
    .map((e) => {
      const rec = byStudent.get(e.student.id);
      return {
        studentId: e.student.id,
        name: e.student.user.nameAsInId,
        status: rec?.status ?? AttendanceStatus.PRESENT,
        note: rec?.note ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ═══════════════ العذر والاستئذان — إجراءان بدورة حياة ═══════════════

type ExcuseTarget = "ABSENT_EXCUSED" | "PRE_EXCUSED";

interface ExcusePayload {
  targetStatus: ExcuseTarget;
  date: string;
  reason: string;
  [k: string]: Prisma.JsonValue | undefined;
}

async function proposeAbsenceExcuse(
  target: ExcuseTarget,
  args: { studentId: string; date: string | Date; reason: string; requestedBy: string },
  db: PrismaClient,
) {
  const reason = args.reason?.trim();
  if (!reason) throw new ValidationError("سبب العذر مطلوب.");
  const date = toDateOnly(args.date);

  if (target === "PRE_EXCUSED") {
    const today = toDateOnly(new Date());
    if (date.getTime() < today.getTime()) {
      throw new ValidationError("الاستئذان المسبق لتاريخٍ لم يأتِ بعد (§١٠٫٢).");
    }
  }

  return db.$transaction(async (tx) => {
    await assertStudentOrGuardian(args.requestedBy, args.studentId, tx);

    // لا طلبٌ مكرّرٌ معلّقٌ لنفس اليوم.
    const dk = dateKey(date);
    const pending = await tx.approval.findMany({
      where: {
        kind: ApprovalKind.ABSENCE_EXCUSE,
        status: ApprovalStatus.PENDING,
        subjectId: args.studentId,
      },
      select: { payload: true },
    });
    if (pending.some((p) => (p.payload as unknown as ExcusePayload | null)?.date === dk)) {
      throw new ValidationError("لهذا اليوم طلبٌ معلّقٌ بالفعل.");
    }

    const payload: ExcusePayload = { targetStatus: target, date: dk, reason };
    const approval = await tx.approval.create({
      data: {
        kind: ApprovalKind.ABSENCE_EXCUSE,
        subjectType: "Student",
        subjectId: args.studentId,
        proposedBy: args.requestedBy,
        status: ApprovalStatus.PENDING,
        payload: payload as unknown as Prisma.InputJsonObject,
      },
    });
    await emitEvent(tx, {
      type: "ABSENCE_EXCUSE_PROPOSED",
      subjectType: "Approval",
      subjectId: approval.id,
      actorId: args.requestedBy,
      payload: { target, date: dk },
    });
    return approval;
  });
}

export interface ExcuseRequestArgs {
  studentId: string;
  date: string | Date;
  reason: string;
  requestedBy: string;
}

/** «غائب بعذر»: طلبٌ لعذرِ غيابٍ واقع (تاريخٌ مضى أو اليوم). */
export function requestAbsenceExcuse(args: ExcuseRequestArgs, db: PrismaClient = prisma) {
  return proposeAbsenceExcuse("ABSENT_EXCUSED", args, db);
}

/** «مستأذن مسبقًا»: طلبٌ قبل الموعد يتحوّل حالةً عند حلول اليوم. */
export function requestPreExcuse(args: ExcuseRequestArgs, db: PrismaClient = prisma) {
  return proposeAbsenceExcuse("PRE_EXCUSED", args, db);
}

export interface DecideExcuseArgs {
  approvalId: string;
  decidedBy: string;
  decision: "APPROVED" | "REJECTED";
  note?: string;
}

/**
 * قبول/رفض العذر. **قاعدة مطلقة (§١٠٫٢):** لا يقبل إلا صاحب صلاحية ABSENCE_EXCUSE
 * (أصالةً أو بتفويض §٣٫٣) — وإلا AuthorizationError. وكلّ قبولٍ يُسجَّل بصاحبه
 * (excuseAcceptedBy/At) على سجل الحضور. عند الاعتماد يُطبَّق الأثر في المعاملة نفسها.
 */
export async function decideExcuse(
  args: DecideExcuseArgs,
  db: PrismaClient = prisma,
) {
  // الحارس المطلق: التفويض قبل أي أثر.
  await assertCapability(args.decidedBy, "ABSENCE_EXCUSE", db);

  const found = await db.approval.findUnique({
    where: { id: args.approvalId },
    select: { kind: true, status: true },
  });
  if (!found || found.kind !== ApprovalKind.ABSENCE_EXCUSE) {
    throw new ValidationError("طلب عذرٍ غير موجود.");
  }

  const approval = await decide(
    {
      approvalId: args.approvalId,
      decidedBy: args.decidedBy,
      decision: args.decision,
      note: args.note,
    },
    db,
  );
  if (args.decision !== "APPROVED") return approval;

  const p = approval.payload as unknown as ExcusePayload | null;
  if (!p || (p.targetStatus !== "ABSENT_EXCUSED" && p.targetStatus !== "PRE_EXCUSED")) {
    throw new ValidationError("حمولة طلب العذر تالفة.");
  }
  const studentId = approval.subjectId;
  const date = toDateOnly(p.date);
  const newStatus =
    p.targetStatus === "ABSENT_EXCUSED"
      ? AttendanceStatus.ABSENT_EXCUSED
      : AttendanceStatus.PRE_EXCUSED;

  await db.$transaction(async (tx) => {
    // الحلقة النشطة للطالب — لسجل حضورٍ جديد إن لم يكن اليوم مرصودًا بعد.
    const enrollment = await tx.enrollment.findFirst({
      where: { studentId, endedAt: null },
      select: { circleId: true },
    });

    const existing = await tx.attendance.findUnique({
      where: { studentId_date: { studentId, date } },
      select: { circleId: true },
    });

    // «مستأذن مسبقًا» ليومٍ لم يُرصد بعد ولا حلقة نشطة: يبقى الاعتماد، ويُطبَّق لاحقًا
    // كسولًا عند الرصد (recordSession يقرأ decidedBy من الاعتماد المعتمَد).
    if (!existing && !enrollment) return;

    await upsertAttendance(tx, {
      studentId,
      circleId: existing?.circleId ?? enrollment!.circleId,
      date,
      status: newStatus,
      recordedBy: args.decidedBy,
      note: p.reason,
      excuseAcceptedBy: args.decidedBy, // يُسجَّل بصاحبه — القاعدة المطلقة
      excuseAcceptedAt: new Date(),
    });
    await emitEvent(tx, {
      type: "ABSENCE_EXCUSE_APPLIED",
      subjectType: "Student",
      subjectId: studentId,
      actorId: args.decidedBy,
      payload: { date: p.date, status: newStatus },
    });
  });

  return approval;
}

// ═══════════════ القياس — بوسيط الأقران بلا حكم (§١١) ═══════════════

/** الوسيط (لا المتوسط §١١٫٣): غائبٌ طويلًا يُفسد المتوسط ولا يحرّك الوسيط. */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface ChapterMeasurement {
  stageId: string;
  peerMedian: number | null;
  cohortSize: number; // من بدأ الباب (له أيام حضور فيه)
  completedCount: number; // من أتمّه
  alertsEnabled: boolean; // §١١٫١: معطَّل حتى ٢٠ إتمامًا
  students: {
    studentId: string;
    attendanceDays: number;
    /** أبطأ من ٧٥٪ من أقرانه — يُحسب فقط بعد تفعيل التنبيه (§١١٫٣). */
    slow: boolean;
  }[];
}

/**
 * قياس بابٍ (§١١٫٣): أيام حضور كلّ طالبٍ فيه، ووسيط الأقران — **بلا حكم**.
 * التنبيه على الشريحة العليا (أبطأ من ٧٥٪) لا يُفعَّل إلا بعد ٢٠ إتمامًا (§١١٫١).
 */
export async function getChapterMeasurement(
  stageId: string,
  db: PrismaClient = prisma,
): Promise<ChapterMeasurement> {
  const rows = await db.stageProgress.findMany({
    where: { stageId, startedAt: { not: null } },
    select: { studentId: true, attendanceDays: true, state: true },
  });
  const days = rows.map((r) => r.attendanceDays);
  const peerMedian = computeMedian(days);
  const completedCount = rows.filter((r) => r.state === ProgressState.COMPLETED).length;
  const alertsEnabled = completedCount >= PEER_ALERT_MIN_COMPLETIONS;

  // حدّ الشريحة العليا (المئين ٧٥) — يُحسب فقط عند تفعيل التنبيه.
  let p75 = Number.POSITIVE_INFINITY;
  if (alertsEnabled && days.length > 0) {
    const s = [...days].sort((a, b) => a - b);
    p75 = s[Math.min(s.length - 1, Math.floor(s.length * 0.75))];
  }

  return {
    stageId,
    peerMedian,
    cohortSize: rows.length,
    completedCount,
    alertsEnabled,
    students: rows
      .map((r) => ({
        studentId: r.studentId,
        attendanceDays: r.attendanceDays,
        slow: alertsEnabled && r.attendanceDays > p75,
      }))
      .sort((a, b) => b.attendanceDays - a.attendanceDays),
  };
}

export interface StudentChapterMeasurement {
  attendanceDays: number;
  peerMedian: number | null; // وسيط الأقران (عداه)
  alertsEnabled: boolean;
}

/**
 * سطر العرض للمدير (§١١٫٣): «خالد في الباب الثاني منذ ١٨ يوم حضور. وسيط أقرانه ٩.»
 * الوسيط محسوبٌ على الأقران (عدا الطالب نفسه). null إن لم يكن للطالب تقدّمٌ في الباب.
 */
export async function getStudentChapterMeasurement(
  studentId: string,
  stageId: string,
  db: PrismaClient = prisma,
): Promise<StudentChapterMeasurement | null> {
  const self = await db.stageProgress.findUnique({
    where: { studentId_stageId: { studentId, stageId } },
    select: { attendanceDays: true, startedAt: true },
  });
  if (!self || self.startedAt === null) return null;

  const peers = await db.stageProgress.findMany({
    where: { stageId, startedAt: { not: null }, studentId: { not: studentId } },
    select: { attendanceDays: true, state: true },
  });
  const completedCount = peers.filter((p) => p.state === ProgressState.COMPLETED).length;

  return {
    attendanceDays: self.attendanceDays,
    peerMedian: computeMedian(peers.map((p) => p.attendanceDays)),
    alertsEnabled: completedCount >= PEER_ALERT_MIN_COMPLETIONS,
  };
}
