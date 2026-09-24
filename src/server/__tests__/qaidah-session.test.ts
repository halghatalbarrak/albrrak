import {
  AutoEventType,
  CertificateTemplate,
  PointGrantSource,
  ProgramKey,
  ProgressState,
  QaidahEvalResult,
  Role,
  StageKind,
  StudentState,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  getQaidahPosition,
  getQaidahSessionBoard,
  recordQaidahSession,
} from "../qaidah-session";
import { createPointItem, getBalance } from "../economy";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

/**
 * سقّالة القاعدة المدنية: برنامج + بابان بدروسٍ (٣ دروس: بابٌ فيه اثنان، بابٌ فيه واحد)،
 * حلقةٌ تحته + معلّمها + طالبٌ منتسب + مدير. (resetDb يمسح بذر الترحيل فنبنيه هنا.)
 */
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const ch1 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "الباب الأول" } });
  const ch2 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 2, nameAr: "الباب الثاني" } });
  const ln1 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.LESSON, ordinal: 1, nameAr: "الدرس الأول", parentId: ch1.id } });
  const ln2 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.LESSON, ordinal: 2, nameAr: "الدرس الثاني", parentId: ch1.id } });
  const ln3 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.LESSON, ordinal: 3, nameAr: "الدرس الثالث", parentId: ch2.id } });

  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });

  return { program, ch1, ch2, ln1, ln2, ln3, circle, teacher, student, manager };
}

describe("جلسة القاعدة — التقدّم بالترتيب (متقن/غير متقن)", () => {
  it("يبدأ بأوّل درس؛ و«متقن» ينقله درسًا واحدًا بالترتيب", async () => {
    const { teacher, student, ln1, ln2 } = await scaffold();
    const p0 = await getQaidahPosition(student.id, prisma);
    expect(p0.current?.lessonId).toBe(ln1.id);
    expect(p0.completedLessons).toBe(0);

    const p1 = await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true }, prisma);
    expect(p1.current?.lessonId).toBe(ln2.id); // تقدّم درسًا واحدًا فقط — لا قفز
    expect(p1.completedLessons).toBe(1);
  });

  it("«غير متقن» يُبقيه في درسه (لا تقدّم)", async () => {
    const { teacher, student, ln1 } = await scaffold();
    const p = await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: false }, prisma);
    expect(p.current?.lessonId).toBe(ln1.id);
    expect(p.completedLessons).toBe(0);
  });

  it("عند إتمام آخر درسٍ في الباب ينتقل لأوّل درس الباب التالي، والباب يُتمّ (COMPLETED)", async () => {
    const { teacher, student, ch1, ln3 } = await scaffold();
    // تقييمٌ واحدٌ في اليوم (ق٥): كلّ إتقانٍ في يومٍ مستقلّ.
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-10" }, prisma); // ln1
    const p = await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-11" }, prisma); // ln2 (آخر الباب ١)
    expect(p.current?.lessonId).toBe(ln3.id);
    expect(p.current?.chapterName).toBe("الباب الثاني");
    // الباب الأول اكتمل (StageProgress) بإتمام كل دروسه.
    const chProg = await prisma.stageProgress.findUnique({
      where: { studentId_stageId: { studentId: student.id, stageId: ch1.id } },
      select: { state: true },
    });
    expect(chProg?.state).toBe(ProgressState.COMPLETED);
  });
});

describe("جلسة القاعدة — القواعد المطلقة (اختبارات الرفض)", () => {
  it("تقييم طالبٍ ليس في القاعدة (مراقي) ← يُرفض", async () => {
    const { manager } = await scaffold();
    // طالبُ مراقي في حلقةٍ لبرنامجٍ آخر، ومعلّمها.
    const mProgram = await createProgram(prisma, ProgramKey.MARAQI);
    const mCircle = await createCircle(prisma, mProgram.id);
    const mTeacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await prisma.circleTeacher.create({ data: { circleId: mCircle.id, teacherId: mTeacher.id } });
    const { student: mStudent } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: mStudent.id, circleId: mCircle.id } });
    void manager;

    await expect(
      recordQaidahSession({ studentId: mStudent.id, actorId: mTeacher.id, mastered: true }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("معلّمٌ ليس معلّم الطالب ← يُرفض في الخادم", async () => {
    const { student } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] }); // بلا حلقة الطالب
    await expect(
      recordQaidahSession({ studentId: student.id, actorId: stranger.id, mastered: true }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("إتقانٌ يتجاوز آخر درس (بعد التخرّج) ← يُرفض", async () => {
    const { teacher, student } = await scaffold();
    // إتقان الدروس الثلاثة كلّها (كلٌّ في يومٍ) ⟵ تخرّج.
    for (let i = 0; i < 3; i++) {
      await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: `2026-05-1${i}` }, prisma);
    }
    await expect(
      recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-20" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("جلسة القاعدة — الإتمام بالتخرّج", () => {
  it("إتمام آخر درس ⟵ حالة COMPLETED + شهادة قاعدةٍ واحدة", async () => {
    const { teacher, student } = await scaffold();
    for (let i = 0; i < 3; i++) {
      await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: `2026-05-1${i}` }, prisma);
    }
    const st = await prisma.student.findUnique({ where: { id: student.id }, select: { state: true } });
    expect(st?.state).toBe(StudentState.COMPLETED);

    const certs = await prisma.certificate.findMany({ where: { studentId: student.id, template: CertificateTemplate.QAIDAH } });
    expect(certs).toHaveLength(1);

    const pos = await getQaidahPosition(student.id, prisma);
    expect(pos.graduated).toBe(true);
    expect(pos.percent).toBe(100);
  });

  it("يمنح نقاطًا تلقائيّة عند التخرّج إن ربطت الإدارة بند AUTO بحدث إتمام القاعدة", async () => {
    const { manager, teacher, student } = await scaffold();
    await createPointItem(manager.id, {
      nameAr: "مكافأة إتمام القاعدة",
      value: 20,
      grantSource: PointGrantSource.AUTO,
      eventType: AutoEventType.QAIDAH_COMPLETE,
    });
    expect(await getBalance(student.id, prisma)).toBe(0);
    for (let i = 0; i < 3; i++) {
      await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: `2026-05-1${i}` }, prisma);
    }
    expect(await getBalance(student.id, prisma)).toBe(20); // مُنح مرّةً عند التخرّج
  });
});

describe("جلسة القاعدة — لوحة المعلّم", () => {
  it("تعرض طلاب الحلقة بدرسهم الحاليّ", async () => {
    const { teacher, circle, student } = await scaffold();
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true }, prisma);
    const board = await getQaidahSessionBoard(teacher.id, circle.id, prisma);
    expect(board.seeded).toBe(true);
    expect(board.students).toHaveLength(1);
    expect(board.students[0].lessonName).toBe("الدرس الثاني");
    expect(board.students[0].chapterName).toBe("الباب الأول");
  });
});

const bindQ = (managerId: string, eventType: AutoEventType, value: number) =>
  createPointItem(managerId, { nameAr: `تلقائيّ-${eventType}`, value, grantSource: PointGrantSource.AUTO, eventType });

describe("جلسة القاعدة — الدمج في الموحّدة (ق٥/ق٦/ق٧ + النقاط)", () => {
  it("ق٥: تقييمٌ واحدٌ في اليوم — النقرة الأخيرة معتمدة، بلا صفٍّ ثانٍ", async () => {
    const { teacher, student } = await scaffold();
    const at = (mastered: boolean) => recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered, date: "2026-05-10" }, prisma);
    await at(true);
    await at(false);
    const rows = await prisma.qaidahDailyEval.findMany({ where: { studentId: student.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toBe(QaidahEvalResult.NOT_MASTERED); // الأخيرة
  });

  it("ق٥: عكس «متقن» إلى «غير متقن» في اليوم نفسه يعيد الموضع للدرس", async () => {
    const { teacher, student, ln1, ln2 } = await scaffold();
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-10" }, prisma);
    expect((await getQaidahPosition(student.id, prisma, "2026-05-10")).current?.lessonId).toBe(ln2.id);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: false, date: "2026-05-10" }, prisma);
    const pos = await getQaidahPosition(student.id, prisma, "2026-05-10");
    expect(pos.current?.lessonId).toBe(ln1.id);
    expect(pos.completedLessons).toBe(0);
  });

  it("ق٦: عدّاد التأجيلات المتتالية عبر أيّامٍ متعدّدة، ويُصفَّر بأيّ متقن/غير متقن", async () => {
    const { teacher, student } = await scaffold();
    const defer = (d: string) => recordQaidahSession({ studentId: student.id, actorId: teacher.id, result: QaidahEvalResult.DEFERRED, date: d }, prisma);
    await defer("2026-05-10");
    await defer("2026-05-11");
    expect((await getQaidahPosition(student.id, prisma, "2026-05-11")).consecutiveDeferrals).toBe(2);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-12" }, prisma);
    expect((await getQaidahPosition(student.id, prisma, "2026-05-12")).consecutiveDeferrals).toBe(0); // صُفِّر
    await defer("2026-05-13");
    expect((await getQaidahPosition(student.id, prisma, "2026-05-13")).consecutiveDeferrals).toBe(1);
  });

  it("ق٤/ق٥ (النقاط كنمط الحضور): متقن ← غير متقن ← متقن = كسب الإتقان فقط، بلا حذف", async () => {
    const { teacher, student, manager } = await scaffold();
    await bindQ(manager.id, AutoEventType.QAIDAH_LESSON_MASTERED, 6);
    await bindQ(manager.id, AutoEventType.QAIDAH_LESSON_NOT_MASTERED, -12);
    const at = (mastered: boolean) => recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered, date: "2026-05-10" }, prisma);
    await at(true);   // +6
    await at(false);  // عكس +6 (−6)، ثمّ −12
    await at(true);   // عكس −12 (+12)، ثمّ +6
    expect(await getBalance(student.id, prisma)).toBe(6);
    const grants = await prisma.autoGrant.findMany({ where: { studentId: student.id } });
    expect(grants.filter((g) => g.reversedAt !== null).length).toBeGreaterThan(0); // عُكِس بلا حذف
    expect(grants.filter((g) => g.reversedAt === null && g.eventType === AutoEventType.QAIDAH_LESSON_MASTERED)).toHaveLength(1);
  });

  it("مؤجَّل: لا نقاط ولا نقل موضع", async () => {
    const { teacher, student, manager, ln1 } = await scaffold();
    await bindQ(manager.id, AutoEventType.QAIDAH_LESSON_MASTERED, 6);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, result: QaidahEvalResult.DEFERRED, date: "2026-05-10" }, prisma);
    const pos = await getQaidahPosition(student.id, prisma, "2026-05-10");
    expect(pos.current?.lessonId).toBe(ln1.id);
    expect(pos.completedLessons).toBe(0);
    expect(await getBalance(student.id, prisma)).toBe(0);
  });

  it("ق٧: بعد التخرّج بتقييم اليوم، تقييمٌ آخر في اليوم نفسه يُرفض (مقفل)", async () => {
    const { teacher, student } = await scaffold();
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-10" }, prisma);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-11" }, prisma);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-12" }, prisma); // تخرّج
    expect((await getQaidahPosition(student.id, prisma, "2026-05-12")).locked).toBe(true);
    await expect(
      recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: false, date: "2026-05-12" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
