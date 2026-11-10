import { ProgramKey, Role, StudentState, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { aerr, verr } from "./errors";
import { emitEvent } from "./events";
import { suggestTrackForStudent } from "./student-setup";

// ═══════════════ تعيين مسار مراقي — المصدر الوحيد (ق٢ — سلّم المسارات) ═══════════════
//
// assignMaraqiTrack هي الدالّة الوحيدة التي تُنشئ TrackAssignment. كل المسارات تمرّ بها:
//   PACE_TEST:        نتيجة اختبار الوتيرة (يُستدعى من maraqi.ts).
//   MANUAL:           تعيينٌ يدويٌّ لطالبٍ بلا مسار (من الشاشة الموحّدة أو صفحة الطالب).
//   AUTO_FROM_FRONTIER: تعيينٌ تلقائيّ عند حفظ الجبهة أو اختيار «لا محفوظ سابق».
//   RAISE:            رفعٌ يدويٌّ فوق المسار الحاليّ (يُستدعى من raiseMaraqiTrack).
//   BULK:             تعيينٌ جماعيّ من الشاشة الموحّدة أو صفحة الحلقة.

type Db = PrismaClient | Prisma.TransactionClient;

export type TrackAssignSource = "MANUAL" | "AUTO_FROM_FRONTIER" | "PACE_TEST" | "RAISE" | "BULK";

export interface AssignTrackArgs {
  studentId: string;
  trackId: string;
  source: TrackAssignSource;
  actorId: string;
  /** مطلوبٌ حين يختار المدير مساراً أدنى من المقترح. */
  note?: string;
}

/** الأدوار التي تملك تعيين المسار لأيّ طالب. */
const MANAGER_ROLES = new Set([Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.TECH_ADMIN]);

/**
 * يُعيَّن مسار مراقي لطالب — المصدر الوحيد لإنشاء TrackAssignment.
 * مساران: db = PrismaClient يبدأ معاملةً مستقلّة؛
 *          db = TransactionClient يكتب مباشرةً (للاستخدام داخل معاملةٍ قائمة).
 */
export async function assignMaraqiTrack(
  args: AssignTrackArgs & { _skipAuth?: boolean; _tx?: Prisma.TransactionClient },
  db: Db = prisma,
): Promise<void> {
  const { studentId, trackId, source, actorId, note, _skipAuth, _tx } = args;

  // ١. جلب المسار (يجب أن يكون مفعَّلاً).
  const track = await db.track.findUnique({ where: { id: trackId }, select: { id: true, isActive: true, nameAr: true, ordinal: true } });
  if (!track) throw verr("trackNotFound");
  if (!track.isActive) throw verr("trackNotActive");

  // ٢. الطالب يجب أن يكون في مراقي.
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      state: true,
      enrollments: {
        where: { endedAt: null },
        select: { programId: true, program: { select: { key: true } }, circleId: true },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!student) throw verr("studentNotFound");
  const MARAQI_STATES: string[] = [StudentState.IN_MARAQI, StudentState.AWAITING_PACE_TEST, StudentState.PACE_RETEST_SCHEDULED];
  const isMaraqiState = MARAQI_STATES.includes(student.state);
  if (!isMaraqiState) throw verr("trackAssignmentMaraqiOnly");
  const enrollment = student.enrollments[0];
  if (!enrollment || enrollment.program?.key !== ProgramKey.MARAQI) throw verr("trackAssignmentMaraqiOnly");

  // ٣. التحقّق من الصلاحية (ما لم يُتجاوز صراحةً لـPaceTest/RAISE).
  if (!_skipAuth) {
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
    if (!actor) throw aerr("unauthorized");
    const isManager = actor.roles.some((r) => (MANAGER_ROLES as Set<string>).has(r));
    if (!isManager) {
      // المعلّم: يعيَّن فقط لطلاب حلقته.
      const teaches = await (db as PrismaClient).circleTeacher.findFirst({
        where: { teacherId: actorId, circleId: enrollment.circleId, endedAt: null },
        select: { circleId: true },
      });
      if (!teaches) throw aerr("unauthorized");
    }

    // المسار الأدنى من المقترح مسموحٌ للمدير فقط + سبب.
    if (source === "MANUAL" || source === "BULK") {
      const suggestion = await suggestTrackForStudent(studentId, db as PrismaClient);
      const suggested = suggestion.availableTracks.find((t) => t.id === suggestion.suggestedTrackId);
      if (suggested && track.ordinal < suggested.ordinal) {
        if (!isManager) throw verr("trackBelowSuggestedManagerOnly");
        if (!note?.trim()) throw verr("trackBelowSuggestedNoteRequired");
      }
    }
  }

  // ٤. الكتابة — إمّا في معاملةٍ جديدةٍ (PrismaClient) أو المُمرَّرة.
  const write = async (tx: Prisma.TransactionClient) => {
    // أغلق المسار النشط الحاليّ إن وُجد.
    const current = await tx.trackAssignment.findFirst({
      where: { studentId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, trackId: true },
    });
    if (current) await tx.trackAssignment.update({ where: { id: current.id }, data: { endedAt: new Date() } });

    // أنشئ التعيين الجديد.
    await tx.trackAssignment.create({
      data: { studentId, trackId, reason: source + (note ? `:${note}` : "") },
    });

    // سجلٌ في AuditLog.
    await tx.auditLog.create({
      data: {
        action: "ASSIGN_TRACK",
        entity: "Student",
        entityId: studentId,
        actorId,
        label: `${source} → ${track.nameAr}`,
      },
    });

    // حدثٌ لصاحب النشاط.
    await emitEvent(tx, {
      type: "MARAQI_TRACK_TRANSITION",
      subjectType: "Student",
      subjectId: studentId,
      actorId,
      payload: { fromTrackId: current?.trackId ?? null, toTrackId: trackId, reason: source, auto: source === "AUTO_FROM_FRONTIER", ...(note ? { note } : {}) },
    });
  };

  if (_tx) {
    await write(_tx);
  } else {
    await (db as PrismaClient).$transaction(write);
  }
}

/** واجهةٌ خفيفة لاستدعاء assignMaraqiTrack داخل معاملةٍ قائمة (بلا تحقّق صلاحية). */
export async function assignMaraqiTrackInTx(
  tx: Prisma.TransactionClient,
  args: Omit<AssignTrackArgs, "note">,
): Promise<void> {
  await assignMaraqiTrack({ ...args, _skipAuth: true, _tx: tx }, tx);
}

/**
 * يُعيَّن المسار التلقائيّ (AUTO_FROM_FRONTIER) لطالبٍ بلا مسارٍ نشط.
 * يقترح من التسكين/الجلسات، ويُعيَّن عبر assignMaraqiTrack (يفحص الصلاحية).
 * إن كان للطالب مسارٌ بالفعل → يُعيد { assigned: false }.
 */
export async function assignMissingTrackForStudent(
  studentId: string,
  actorId: string,
  db: PrismaClient = prisma,
): Promise<{ assigned: boolean }> {
  const hasTrack = await db.trackAssignment.findFirst({ where: { studentId, endedAt: null }, select: { id: true } });
  if (hasTrack) return { assigned: false };
  const suggestion = await suggestTrackForStudent(studentId, db);
  if (!suggestion.suggestedTrackId) return { assigned: false };
  await assignMaraqiTrack({ studentId, trackId: suggestion.suggestedTrackId, source: "AUTO_FROM_FRONTIER", actorId }, db);
  return { assigned: true };
}

/**
 * يُعيَّن المسار التلقائيّ لكلّ طلاب الحلقة المراقييّن بلا مسارٍ نشط.
 * يُرجع إحصائيّات التعيين. يُستخدَم من زرّ «تعيين المسارات الناقصة» في الشاشة الموحّدة.
 */
export async function autoAssignMissingTracks(
  circleId: string,
  actorId: string,
  db: PrismaClient = prisma,
): Promise<{ assigned: number; failed: number; details: { studentId: string; ok: boolean; error?: string }[] }> {
  const enrollments = await db.enrollment.findMany({
    where: { circleId, endedAt: null, program: { key: ProgramKey.MARAQI } },
    select: { studentId: true },
  });
  if (!enrollments.length) return { assigned: 0, failed: 0, details: [] };

  const withTrack = await db.trackAssignment.findMany({
    where: { studentId: { in: enrollments.map((e) => e.studentId) }, endedAt: null },
    select: { studentId: true },
  });
  const withTrackSet = new Set(withTrack.map((a) => a.studentId));
  const without = enrollments.filter((e) => !withTrackSet.has(e.studentId));

  const details: { studentId: string; ok: boolean; error?: string }[] = [];
  let assigned = 0, failed = 0;

  for (const { studentId } of without) {
    try {
      const suggestion = await suggestTrackForStudent(studentId, db);
      if (!suggestion.suggestedTrackId) { failed++; details.push({ studentId, ok: false, error: "no-suggestion" }); continue; }
      await assignMaraqiTrack({ studentId, trackId: suggestion.suggestedTrackId, source: "AUTO_FROM_FRONTIER", actorId, _skipAuth: true }, db);
      assigned++;
      details.push({ studentId, ok: true });
    } catch (e) {
      failed++;
      details.push({ studentId, ok: false, error: e instanceof Error ? e.message : "خطأ" });
    }
  }
  return { assigned, failed, details };
}

/** يُرجع أسماء الطلاب المراقييّن في الحلقة بلا مسارٍ نشط (للعرض في شارة الزرّ). */
export async function getMissingTrackStudents(
  circleId: string,
  db: PrismaClient = prisma,
): Promise<{ count: number; students: { studentId: string; name: string }[] }> {
  const enrollments = await db.enrollment.findMany({
    where: { circleId, endedAt: null, program: { key: ProgramKey.MARAQI } },
    select: { studentId: true, student: { select: { user: { select: { nameAsInId: true } } } } },
  });
  if (!enrollments.length) return { count: 0, students: [] };
  const withTrack = await db.trackAssignment.findMany({
    where: { studentId: { in: enrollments.map((e) => e.studentId) }, endedAt: null },
    select: { studentId: true },
  });
  const withTrackSet = new Set(withTrack.map((a) => a.studentId));
  const without = enrollments.filter((e) => !withTrackSet.has(e.studentId));
  return { count: without.length, students: without.map((e) => ({ studentId: e.studentId, name: e.student.user.nameAsInId })) };
}

/** يُرجع مجموعة معرّفات الطلاب المنتسبين للحلقة (للتحقّق في الـAPI). */
export async function getCircleStudentIds(
  circleId: string,
  db: PrismaClient = prisma,
): Promise<Set<string>> {
  const rows = await db.enrollment.findMany({ where: { circleId, endedAt: null }, select: { studentId: true } });
  return new Set(rows.map((r) => r.studentId));
}
