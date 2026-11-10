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
  const isMaraqiState = [StudentState.IN_MARAQI, StudentState.AWAITING_PACE_TEST, StudentState.PACE_RETEST_SCHEDULED].includes(student.state);
  if (!isMaraqiState) throw verr("trackAssignmentMaraqiOnly");
  const enrollment = student.enrollments[0];
  if (!enrollment || enrollment.program?.key !== ProgramKey.MARAQI) throw verr("trackAssignmentMaraqiOnly");

  // ٣. التحقّق من الصلاحية (ما لم يُتجاوز صراحةً لـPaceTest/RAISE).
  if (!_skipAuth) {
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
    if (!actor) throw aerr("unauthorized");
    const isManager = actor.roles.some((r) => MANAGER_ROLES.has(r));
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
