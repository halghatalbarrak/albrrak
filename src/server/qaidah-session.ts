import { randomUUID } from "node:crypto";

import {
  AutoEventType,
  CertificateTemplate,
  ProgramKey,
  ProgressState,
  QaidahEvalResult,
  StageKind,
  StudentState,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { assertCanRecordCircle, toDateOnly } from "./attendance";
import { assertTeachesStudent, listCircleStudents } from "./daily-session";
import { grantAuto, reverseConflictingAutoGrants, QAIDAH_LESSON_EVENT_GROUP } from "./economy";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// ═══════════════ جلسة القاعدة المدنية (QAIDAH_RULES.md) — مُدمجةٌ في الشاشة الموحّدة (م ج) ═══════════════
//
// محرّكٌ مبسّط (منفصلٌ عن مراقي): **الدرس وحدة الجلسة**. المعلّم يقيّم درس الطالب الحاليّ:
//   «متقن»    ⟵ ينتقل للدرس التالي بالترتيب (وعند آخر درسٍ في الباب ⟵ أوّل درس الباب التالي).
//   «غير متقن» ⟵ يبقى في درسه، يُعاد في الجلسة القادمة.
//   «مؤجَّل»   ⟵ حاضرٌ لم يُقيَّم لضيق الوقت: لا ينقل الموضع ولا نقاط (ق٦).
//
// التقدّم مقيّدٌ بالترتيب صارمًا في الخادم (لا قفز): المحرّك يعمل على «الدرس الحاليّ» = أوّل درسٍ
// غير مكتمل. الباب = CHAPTER، والدرس = LESSON ابنٌ له (parentId). الإتمام يُتتبَّع عبر
// StageProgress (COMPLETED للدرس المُتقَن). وتقييمُ اليوم يُخزَّن في QaidahDailyEval:
//   • ق٥: تقييمٌ واحدٌ في اليوم (مفتاح فريد studentId+date، upsert)؛ تغيير التقييم في اليوم يعكس
//     أثر السابق — الموضع (إعادة الدرس IN_PROGRESS) والنقاط (reverseConflictingAutoGrants).
//   • ق٤: متقن ⟵ بند AUTO (QAIDAH_LESSON_MASTERED)، غير متقن ⟵ (QAIDAH_LESSON_NOT_MASTERED).
//     لا أرقام في الكود — الإدارة تربط البندين (وخصم «غير متقن» ضعف المنح بقرارها، كمراقي).
//   • ق٦: عدّاد التأجيلات المتتالية (من QaidahDailyEval وحده) يُصفَّر بأيّ متقن/غير متقن.
//   • ق٧: إن سبّب «متقن» على الدرس الأخير التخرّج، يُقفَل تقييم ذلك اليوم (عكس التخرّج إداريّ منفصل).

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

interface OrderedLesson {
  id: string;
  ordinal: number;
  nameAr: string;
  parentId: string | null;
}

interface QaidahLessonSet {
  programId: string;
  lessons: OrderedLesson[]; // مرتّبةٌ بـ ordinal العالميّ (١..ن)
  chapters: Map<string, { nameAr: string; ordinal: number }>;
}

/** يحمّل دروس القاعدة (LESSON) مرتّبةً + خريطة الأبواب. null إن لم يُبذَر البرنامج. */
async function loadQaidah(db: PrismaClient | Prisma.TransactionClient): Promise<QaidahLessonSet | null> {
  const program = await db.program.findUnique({
    where: { key: ProgramKey.QAIDAH_MADANIYYAH },
    select: { id: true },
  });
  if (!program) return null;
  const [lessons, chapters] = await Promise.all([
    db.stage.findMany({
      where: { programId: program.id, kind: StageKind.LESSON },
      orderBy: { ordinal: "asc" },
      select: { id: true, ordinal: true, nameAr: true, parentId: true },
    }),
    db.stage.findMany({
      where: { programId: program.id, kind: StageKind.CHAPTER },
      select: { id: true, nameAr: true, ordinal: true },
    }),
  ]);
  return {
    programId: program.id,
    lessons,
    chapters: new Map(chapters.map((c) => [c.id, { nameAr: c.nameAr, ordinal: c.ordinal }])),
  };
}

// ═══════════════ موضع الطالب (مشتقٌّ من StageProgress + تقييم اليوم) ═══════════════

export interface QaidahCurrent {
  lessonId: string;
  lessonName: string;
  chapterId: string | null;
  chapterName: string | null;
  chapterOrdinal: number | null;
  lessonIndexInChapter: number; // ترتيب الدرس داخل بابه (١-مبدوء)
  lessonsInChapter: number;
  globalIndex: number; // ترتيبه بين كلّ الدروس (١-مبدوء)
}

export interface QaidahPosition {
  seeded: boolean;
  started: boolean;
  graduated: boolean;
  totalLessons: number;
  completedLessons: number;
  percent: number; // ٠..١٠٠
  current: QaidahCurrent | null; // null إن تخرّج أو لم يُبذَر
  /** تقييم اليوم إن وُجد (MASTERED | NOT_MASTERED | DEFERRED) — لعرض حالة الطالب في اللوحة. */
  todayResult: QaidahEvalResult | null;
  /** ق٦: عدد التأجيلات المتتالية الأحدث حتى أوّل متقن/غير متقن (من QaidahDailyEval وحده). */
  consecutiveDeferrals: number;
  /** ق٧: تخرّجٌ بتقييم اليوم (متقن على الدرس الأخير) — التقييم مقفلٌ لذلك اليوم. */
  locked: boolean;
  /** آخر تقييمٍ للطالب «مؤجَّل» (عرضٌ فقط). */
  deferredIsLatest: boolean;
}

const emptyPosition: QaidahPosition = {
  seeded: false, started: false, graduated: false,
  totalLessons: 0, completedLessons: 0, percent: 0, current: null,
  todayResult: null, consecutiveDeferrals: 0, locked: false, deferredIsLatest: false,
};

function buildCurrent(set: QaidahLessonSet, lesson: OrderedLesson): QaidahCurrent {
  const siblings = set.lessons.filter((l) => l.parentId === lesson.parentId);
  const ch = lesson.parentId ? set.chapters.get(lesson.parentId) : undefined;
  return {
    lessonId: lesson.id,
    lessonName: lesson.nameAr,
    chapterId: lesson.parentId,
    chapterName: ch?.nameAr ?? null,
    chapterOrdinal: ch?.ordinal ?? null,
    lessonIndexInChapter: siblings.findIndex((l) => l.id === lesson.id) + 1,
    lessonsInChapter: siblings.length,
    globalIndex: set.lessons.findIndex((l) => l.id === lesson.id) + 1,
  };
}

async function positionFromSet(
  studentId: string,
  set: QaidahLessonSet,
  db: PrismaClient | Prisma.TransactionClient,
  date: string | Date = new Date(),
): Promise<QaidahPosition> {
  const completed = await db.stageProgress.findMany({
    where: {
      studentId,
      state: ProgressState.COMPLETED,
      stage: { programId: set.programId, kind: StageKind.LESSON },
    },
    select: { stageId: true },
  });
  const doneIds = new Set(completed.map((r) => r.stageId));
  const completedLessons = set.lessons.filter((l) => doneIds.has(l.id)).length;
  const current = set.lessons.find((l) => !doneIds.has(l.id)) ?? null;
  const total = set.lessons.length;
  const graduated = total > 0 && current == null;

  // تقييمات القاعدة اليوميّة (الأحدث أوّلاً): عدّاد التأجيلات المتتالية + تقييم اليوم + القفل.
  const today = toDateOnly(date);
  const evals = await db.qaidahDailyEval.findMany({
    where: { studentId },
    orderBy: { date: "desc" },
    select: { date: true, result: true },
  });
  let consecutiveDeferrals = 0;
  for (const e of evals) {
    if (e.result === QaidahEvalResult.DEFERRED) consecutiveDeferrals++;
    else break;
  }
  const todayResult = evals.find((e) => e.date.getTime() === today.getTime())?.result ?? null;

  return {
    seeded: true,
    started: completedLessons > 0,
    graduated,
    totalLessons: total,
    completedLessons,
    percent: total > 0 ? Math.round((completedLessons / total) * 100) : 0,
    current: current ? buildCurrent(set, current) : null,
    todayResult,
    consecutiveDeferrals,
    locked: graduated && todayResult === QaidahEvalResult.MASTERED,
    deferredIsLatest: evals[0]?.result === QaidahEvalResult.DEFERRED,
  };
}

/** موضع طالبٍ في القاعدة (للعرض). حالةٌ فارغةٌ آمنة إن لم تُبذَر الدروس. */
export async function getQaidahPosition(
  studentId: string,
  db: PrismaClient = prisma,
  date: string | Date = new Date(),
): Promise<QaidahPosition> {
  const set = await loadQaidah(db);
  if (!set || set.lessons.length === 0) return emptyPosition;
  return positionFromSet(studentId, set, db, date);
}

/** موضع صاحب الحساب الطالب (لصفحته). null إن لم يكن الحساب طالبًا. */
export async function getMyQaidahPosition(
  userId: string,
  db: PrismaClient = prisma,
): Promise<QaidahPosition | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { student: { select: { id: true } } },
  });
  if (!user?.student) return null;
  return getQaidahPosition(user.student.id, db);
}

// ═══════════════ تسجيل الجلسة (متقن / غير متقن / مؤجَّل) ═══════════════

export interface QaidahSessionArgs {
  studentId: string;
  actorId: string;
  /** النتيجة صراحةً؛ أو mastered (توافقٌ خلفيّ: true=متقن، false=غير متقن). */
  result?: QaidahEvalResult;
  mastered?: boolean;
  date?: string | Date;
}

function resolveResult(args: QaidahSessionArgs): QaidahEvalResult {
  if (args.result) return args.result;
  if (args.mastered === true) return QaidahEvalResult.MASTERED;
  if (args.mastered === false) return QaidahEvalResult.NOT_MASTERED;
  throw new ValidationError("نتيجة التقييم مطلوبة (متقن/غير متقن/مؤجَّل).");
}

/**
 * يقيّم درس الطالب الحاليّ (م ج). قواعد مطلقة في الخادم:
 *   • المُقيِّم معلّم الحلقة أو الإدارة؛ والطالب في القاعدة المدنية — وإلّا يُرفض.
 *   • ق٧: لا تقييمَ بعد تخرّجٍ سبّبه تقييمُ اليوم (مقفل)؛ ولا تقييمَ إن أتمّ كلّ الدروس.
 *   • ق٥: تقييمٌ واحدٌ في اليوم (upsert)؛ تغييرُه يعكس أثر السابق (الموضع + النقاط) قبل الجديد.
 *   • «متقن» ينقل درسًا واحدًا بالترتيب (لا قفز)؛ آخر درسٍ ⟵ تخرّجٌ + شهادة + حدث + نقاط AUTO.
 */
export async function recordQaidahSession(
  args: QaidahSessionArgs,
  db: PrismaClient = prisma,
): Promise<QaidahPosition> {
  const result = resolveResult(args);
  const sc = await assertTeachesStudent(args.actorId, args.studentId, db);
  if (sc.programKey !== ProgramKey.QAIDAH_MADANIYYAH) {
    throw new ValidationError("جلسة القاعدة لطلاب القاعدة المدنية.");
  }
  const set = await loadQaidah(db);
  if (!set || set.lessons.length === 0) {
    throw new ValidationError("لا دروسَ مبذورةٌ للقاعدة المدنية بعد.");
  }
  const date = toDateOnly(args.date ?? new Date());
  const dk = dayKey(date);

  // ق٧: قفل التخرّج — تقييم اليوم «متقن» وقد تخرّج الطالب ⟵ لا تعديل (عكس التخرّج إداريّ منفصل).
  const prior = await db.qaidahDailyEval.findUnique({
    where: { studentId_date: { studentId: args.studentId, date } },
    select: { result: true, lessonId: true },
  });
  const student0 = await db.student.findUnique({ where: { id: args.studentId }, select: { state: true } });
  if (prior?.result === QaidahEvalResult.MASTERED && student0?.state === StudentState.COMPLETED) {
    throw new ValidationError("تخرّج الطالب من القاعدة اليوم — التقييم مقفل.");
  }

  await db.$transaction(async (tx) => {
    // ١) اعكس أثر الموضع لتقييم اليوم السابق «متقن» (أعِد الدرس وبابه إلى IN_PROGRESS).
    if (prior?.result === QaidahEvalResult.MASTERED) {
      await tx.stageProgress.updateMany({
        where: { studentId: args.studentId, stageId: prior.lessonId, state: ProgressState.COMPLETED },
        data: { state: ProgressState.IN_PROGRESS, completedAt: null },
      });
      const lesson = set.lessons.find((l) => l.id === prior.lessonId);
      if (lesson?.parentId) {
        await tx.stageProgress.updateMany({
          where: { studentId: args.studentId, stageId: lesson.parentId, state: ProgressState.COMPLETED },
          data: { state: ProgressState.IN_PROGRESS, completedAt: null },
        });
      }
    }

    // ٢) الدرس الحاليّ (بعد العكس) = أوّل درسٍ غير مكتمل.
    const completed = await tx.stageProgress.findMany({
      where: { studentId: args.studentId, state: ProgressState.COMPLETED, stage: { programId: set.programId, kind: StageKind.LESSON } },
      select: { stageId: true },
    });
    const doneIds = new Set(completed.map((r) => r.stageId));
    const current = set.lessons.find((l) => !doneIds.has(l.id)) ?? null;
    if (!current) throw new ValidationError("أتمّ الطالب كلّ الدروس — لا تقييمَ بعد التخرّج.");

    // ٣) اعكس النقاط المتنافية لليوم قبل منح الجديد (ق٥). مؤجَّل ⟵ عكس الكلّ (بلا keepEvent).
    const keepEvent =
      result === QaidahEvalResult.MASTERED ? AutoEventType.QAIDAH_LESSON_MASTERED
      : result === QaidahEvalResult.NOT_MASTERED ? AutoEventType.QAIDAH_LESSON_NOT_MASTERED
      : undefined;
    await reverseConflictingAutoGrants(tx, { studentId: args.studentId, dayKey: dk, group: QAIDAH_LESSON_EVENT_GROUP, keepEvent, actorId: args.actorId });

    // ٤) طبّق النتيجة.
    if (result === QaidahEvalResult.MASTERED) {
      await tx.stageProgress.upsert({
        where: { studentId_stageId: { studentId: args.studentId, stageId: current.id } },
        update: { state: ProgressState.COMPLETED, completedAt: new Date() },
        create: {
          student: { connect: { id: args.studentId } },
          stage: { connect: { id: current.id } },
          state: ProgressState.COMPLETED, startedAt: new Date(), completedAt: new Date(),
        },
      });
      await emitEvent(tx, { type: "QAIDAH_LESSON_MASTERED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId, payload: { lessonId: current.id } });

      // تقدّم الباب — يُتمّ عند إتقان آخر دروسه.
      if (current.parentId) {
        const siblingIds = set.lessons.filter((l) => l.parentId === current.parentId).map((l) => l.id);
        const doneNow = new Set([...doneIds, current.id]);
        const chapterDone = siblingIds.every((id) => doneNow.has(id));
        await tx.stageProgress.upsert({
          where: { studentId_stageId: { studentId: args.studentId, stageId: current.parentId } },
          update: chapterDone ? { state: ProgressState.COMPLETED, completedAt: new Date() } : { state: ProgressState.IN_PROGRESS },
          create: {
            student: { connect: { id: args.studentId } },
            stage: { connect: { id: current.parentId } },
            state: chapterDone ? ProgressState.COMPLETED : ProgressState.IN_PROGRESS,
            startedAt: new Date(), ...(chapterDone ? { completedAt: new Date() } : {}),
          },
        });
      }

      // آخر درسٍ في آخر باب ⟵ تخرّجٌ من القاعدة: حالة + شهادة (idempotent) + حدث + نقاط AUTO.
      const isLastLesson = set.lessons[set.lessons.length - 1]?.id === current.id;
      if (isLastLesson) {
        await tx.student.update({ where: { id: args.studentId }, data: { state: StudentState.COMPLETED } });
        const already = await tx.certificate.findFirst({ where: { studentId: args.studentId, template: CertificateTemplate.QAIDAH }, select: { id: true } });
        if (!already) {
          await tx.certificate.create({ data: { studentId: args.studentId, template: CertificateTemplate.QAIDAH, verifyToken: randomUUID() } });
        }
        await emitEvent(tx, { type: "QAIDAH_COMPLETED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId, payload: { programId: set.programId } });
        await grantAuto(tx, AutoEventType.QAIDAH_COMPLETE, args.studentId, set.programId);
      }

      // نقاط الدرس المُتقَن (م ج، ق٤) — مرجعُ اليوم (منع ازدواج + قابلية عكس).
      await grantAuto(tx, AutoEventType.QAIDAH_LESSON_MASTERED, args.studentId, dk);
    } else if (result === QaidahEvalResult.NOT_MASTERED) {
      await emitEvent(tx, { type: "QAIDAH_LESSON_NOT_MASTERED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId, payload: { lessonId: current.id } });
      await grantAuto(tx, AutoEventType.QAIDAH_LESSON_NOT_MASTERED, args.studentId, dk);
    } else {
      // مؤجَّل: لا موضعٌ ولا نقاط — سطرٌ محايد (ق٦).
      await emitEvent(tx, { type: "QAIDAH_SESSION_DEFERRED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorId, payload: { lessonId: current.id, date: dk } });
    }

    // ٥) سجّل تقييم اليوم (ق٥: تقييمٌ واحدٌ في اليوم — upsert بمفتاح studentId+date).
    await tx.qaidahDailyEval.upsert({
      where: { studentId_date: { studentId: args.studentId, date } },
      update: { result, lessonId: current.id, evaluatedById: args.actorId },
      create: { studentId: args.studentId, date, result, lessonId: current.id, evaluatedById: args.actorId },
    });
  });

  return getQaidahPosition(args.studentId, db, date);
}

// ═══════════════ لوحة الجلسة للمعلّم (كل طلاب الحلقة) ═══════════════

export interface QaidahBoardStudent {
  studentId: string;
  name: string;
  started: boolean;
  graduated: boolean;
  deferred: boolean; // آخر تقييمٍ «مؤجَّل»
  todayResult: QaidahEvalResult | null;
  consecutiveDeferrals: number;
  locked: boolean;
  chapterName: string | null;
  lessonName: string | null;
  lessonIndexInChapter: number | null;
  lessonsInChapter: number | null;
  percent: number;
}

export interface QaidahBoard {
  circle: { id: string; nameAr: string } | null;
  seeded: boolean;
  students: QaidahBoardStudent[];
}

/** يبني سطر لوحة القاعدة من موضع الطالب (مشترَكٌ بين لوحة القاعدة والشاشة الموحّدة). */
export function qaidahBoardRow(studentId: string, name: string, pos: QaidahPosition): QaidahBoardStudent {
  return {
    studentId, name,
    started: pos.started,
    graduated: pos.graduated,
    deferred: pos.deferredIsLatest,
    todayResult: pos.todayResult,
    consecutiveDeferrals: pos.consecutiveDeferrals,
    locked: pos.locked,
    chapterName: pos.current?.chapterName ?? null,
    lessonName: pos.current?.lessonName ?? null,
    lessonIndexInChapter: pos.current?.lessonIndexInChapter ?? null,
    lessonsInChapter: pos.current?.lessonsInChapter ?? null,
    percent: pos.percent,
  };
}

/**
 * لوحة جلسة القاعدة لحلقةٍ: كل طلابها، لكلٍّ درسه الحاليّ (الباب + الدرس) ونسبته وتقييم اليوم.
 * تفويضٌ على مستوى الحلقة (معلّمها أو الإدارة). عرضٌ للقراءة — لا يغيّر شيئًا.
 */
export async function getQaidahSessionBoard(
  actorId: string,
  circleId: string,
  db: PrismaClient = prisma,
): Promise<QaidahBoard> {
  await assertCanRecordCircle(actorId, circleId, db);
  const circle = await db.circle.findUnique({
    where: { id: circleId },
    select: { id: true, nameAr: true, program: { select: { key: true } } },
  });
  if (!circle) return { circle: null, seeded: false, students: [] };
  if (circle.program.key !== ProgramKey.QAIDAH_MADANIYYAH) {
    throw new ValidationError("لوحة جلسة القاعدة لحلقات القاعدة المدنية.");
  }
  const set = await loadQaidah(db);
  const roster = await listCircleStudents(circleId, db);
  const students: QaidahBoardStudent[] = [];
  for (const s of roster) {
    const pos = set && set.lessons.length > 0 ? await positionFromSet(s.id, set, db) : emptyPosition;
    students.push(qaidahBoardRow(s.id, s.name, pos));
  }
  return {
    circle: { id: circle.id, nameAr: circle.nameAr },
    seeded: !!set && set.lessons.length > 0,
    students,
  };
}
