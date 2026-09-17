import { randomUUID } from "node:crypto";

import {
  AutoEventType,
  CertificateTemplate,
  ProgramKey,
  ProgressState,
  StageKind,
  StudentState,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { assertCanRecordCircle } from "./attendance";
import { assertTeachesStudent, listCircleStudents } from "./daily-session";
import { grantAuto } from "./economy";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// ═══════════════ جلسة القاعدة المدنية (QAIDAH_RULES.md) ═══════════════
//
// محرّكٌ مبسّط (منفصلٌ عن مراقي): **الدرس وحدة الجلسة**. المعلّم يقيّم درس الطالب الحاليّ:
//   «متقن»    ⟵ ينتقل للدرس التالي بالترتيب (وعند آخر درسٍ في الباب ⟵ أوّل درس الباب التالي).
//   «غير متقن» ⟵ يبقى في درسه، يُعاد في الجلسة القادمة. بلا حفظٍ تنازليّ ولا حصادٍ ولا خريطة ضعف.
//
// التقدّم **مقيّد بالترتيب صارمًا في الخادم (لا قفز):** المحرّك يعمل دائمًا على «الدرس الحاليّ»
// = أوّل درسٍ غير مكتمل (بترتيب ordinal العالميّ)، والواجهة لا تمرّر درسًا مقصودًا — فالقفز
// مستحيلٌ بنيويًّا. الباب = CHAPTER، والدرس = LESSON ابنٌ له (parentId). الموضع والإتقان
// يُتتبَّعان عبر StageProgress القائم (state = COMPLETED للدرس المُتقَن) — بلا حقلٍ جديد.

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
async function loadQaidah(db: PrismaClient): Promise<QaidahLessonSet | null> {
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

// ═══════════════ موضع الطالب (مشتقٌّ من StageProgress) ═══════════════

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
}

const emptyPosition: QaidahPosition = {
  seeded: false, started: false, graduated: false,
  totalLessons: 0, completedLessons: 0, percent: 0, current: null,
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
  db: PrismaClient,
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
  return {
    seeded: true,
    started: completedLessons > 0,
    graduated: total > 0 && current == null,
    totalLessons: total,
    completedLessons,
    percent: total > 0 ? Math.round((completedLessons / total) * 100) : 0,
    current: current ? buildCurrent(set, current) : null,
  };
}

/** موضع طالبٍ في القاعدة (للعرض). حالةٌ فارغةٌ آمنة إن لم تُبذَر الدروس. */
export async function getQaidahPosition(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<QaidahPosition> {
  const set = await loadQaidah(db);
  if (!set || set.lessons.length === 0) return emptyPosition;
  return positionFromSet(studentId, set, db);
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

// ═══════════════ تسجيل الجلسة (متقن / غير متقن) ═══════════════

export interface QaidahSessionArgs {
  studentId: string;
  actorId: string;
  mastered: boolean;
}

/**
 * يقيّم درس الطالب الحاليّ. قواعد مطلقة في الخادم:
 *   • المُقيِّم معلّم الحلقة أو الإدارة (assertTeachesStudent).
 *   • الطالب في برنامج القاعدة المدنية (عبر انتسابه) — وإلّا يُرفض.
 *   • لا تقييمَ بعد التخرّج (تجاوز آخر درس) — يُرفض.
 *   • «متقن» ينقل درسًا واحدًا بالترتيب فقط (لا قفز). آخر درسٍ ⟵ تخرّجٌ + شهادة + حدث + نقاط AUTO.
 */
export async function recordQaidahSession(
  args: QaidahSessionArgs,
  db: PrismaClient = prisma,
): Promise<QaidahPosition> {
  const sc = await assertTeachesStudent(args.actorId, args.studentId, db);
  if (sc.programKey !== ProgramKey.QAIDAH_MADANIYYAH) {
    throw new ValidationError("جلسة القاعدة لطلاب القاعدة المدنية.");
  }
  const set = await loadQaidah(db);
  if (!set || set.lessons.length === 0) {
    throw new ValidationError("لا دروسَ مبذورةٌ للقاعدة المدنية بعد.");
  }

  const completed = await db.stageProgress.findMany({
    where: {
      studentId: args.studentId,
      state: ProgressState.COMPLETED,
      stage: { programId: set.programId, kind: StageKind.LESSON },
    },
    select: { stageId: true },
  });
  const doneIds = new Set(completed.map((r) => r.stageId));
  const current = set.lessons.find((l) => !doneIds.has(l.id)) ?? null;
  if (!current) {
    throw new ValidationError("أتمّ الطالب كلّ الدروس — لا تقييمَ بعد التخرّج.");
  }

  // «غير متقن» ⟵ يبقى في درسه؛ حدثٌ للسجلّ فقط، بلا تغيير موضع.
  if (!args.mastered) {
    await emitEvent(db, {
      type: "QAIDAH_LESSON_NOT_MASTERED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.actorId,
      payload: { lessonId: current.id },
    });
    return positionFromSet(args.studentId, set, db);
  }

  const isLastLesson = set.lessons[set.lessons.length - 1]?.id === current.id;

  await db.$transaction(async (tx) => {
    // إتقان الدرس الحاليّ ⟵ COMPLETED (الانتقال للتالي مشتقٌّ لاحقًا).
    await tx.stageProgress.upsert({
      where: { studentId_stageId: { studentId: args.studentId, stageId: current.id } },
      update: { state: ProgressState.COMPLETED, completedAt: new Date() },
      create: {
        student: { connect: { id: args.studentId } },
        stage: { connect: { id: current.id } },
        state: ProgressState.COMPLETED,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await emitEvent(tx, {
      type: "QAIDAH_LESSON_MASTERED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.actorId,
      payload: { lessonId: current.id },
    });

    // تقدّم الباب (CHAPTER) — يُتمّ عند إتقان آخر دروسه (يبقى السلّم البياني القائم متّسقًا).
    if (current.parentId) {
      const siblingIds = set.lessons.filter((l) => l.parentId === current.parentId).map((l) => l.id);
      const doneNow = new Set([...doneIds, current.id]);
      const chapterDone = siblingIds.every((id) => doneNow.has(id));
      await tx.stageProgress.upsert({
        where: { studentId_stageId: { studentId: args.studentId, stageId: current.parentId } },
        update: chapterDone
          ? { state: ProgressState.COMPLETED, completedAt: new Date() }
          : { state: ProgressState.IN_PROGRESS },
        create: {
          student: { connect: { id: args.studentId } },
          stage: { connect: { id: current.parentId } },
          state: chapterDone ? ProgressState.COMPLETED : ProgressState.IN_PROGRESS,
          startedAt: new Date(),
          ...(chapterDone ? { completedAt: new Date() } : {}),
        },
      });
    }

    // آخر درسٍ في آخر باب ⟵ تخرّجٌ من القاعدة: حالة + شهادة (idempotent) + حدث + نقاط AUTO.
    if (isLastLesson) {
      await tx.student.update({
        where: { id: args.studentId },
        data: { state: StudentState.COMPLETED },
      });
      const already = await tx.certificate.findFirst({
        where: { studentId: args.studentId, template: CertificateTemplate.QAIDAH },
        select: { id: true },
      });
      if (!already) {
        await tx.certificate.create({
          data: {
            studentId: args.studentId,
            template: CertificateTemplate.QAIDAH,
            verifyToken: randomUUID(),
          },
        });
      }
      await emitEvent(tx, {
        type: "QAIDAH_COMPLETED",
        subjectType: "Student",
        subjectId: args.studentId,
        actorId: args.actorId,
        payload: { programId: set.programId },
      });
      // منح نقاطٍ تلقائيّ إن ربطت الإدارة بندًا AUTO بحدث إتمام القاعدة (م٦أ-٢). مرّةً لكل طالب.
      await grantAuto(tx, AutoEventType.QAIDAH_COMPLETE, args.studentId, set.programId);
    }
  });

  return positionFromSet(args.studentId, set, db);
}

// ═══════════════ لوحة الجلسة للمعلّم (كل طلاب الحلقة) ═══════════════

export interface QaidahBoardStudent {
  studentId: string;
  name: string;
  started: boolean;
  graduated: boolean;
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

/**
 * لوحة جلسة القاعدة لحلقةٍ: كل طلابها معروضون، لكلٍّ درسه الحاليّ (الباب + الدرس) ونسبته.
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
    students.push({
      studentId: s.id,
      name: s.name,
      started: pos.started,
      graduated: pos.graduated,
      chapterName: pos.current?.chapterName ?? null,
      lessonName: pos.current?.lessonName ?? null,
      lessonIndexInChapter: pos.current?.lessonIndexInChapter ?? null,
      lessonsInChapter: pos.current?.lessonsInChapter ?? null,
      percent: pos.percent,
    });
  }
  return {
    circle: { id: circle.id, nameAr: circle.nameAr },
    seeded: !!set && set.lessons.length > 0,
    students,
  };
}
