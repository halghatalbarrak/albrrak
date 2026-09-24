import {
  AttendanceStatus,
  ProgramKey,
  QaidahEvalResult,
  Role,
  StageKind,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deferSession } from "../session-deferral";
import { getQaidahPosition, recordQaidahSession } from "../qaidah-session";
import { getBalance } from "../economy";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const DATE = "2026-05-11";

/** سقّالة قاعدةٍ (برنامج + بابان بثلاثة دروس + حلقة + معلّمها + طالب منتسب + مدير). */
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const ch1 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "الباب الأول" } });
  const ch2 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 2, nameAr: "الباب الثاني" } });
  await prisma.stage.create({ data: { programId: program.id, kind: StageKind.LESSON, ordinal: 1, nameAr: "الدرس الأول", parentId: ch1.id } });
  await prisma.stage.create({ data: { programId: program.id, kind: StageKind.LESSON, ordinal: 2, nameAr: "الدرس الثاني", parentId: ch1.id } });
  await prisma.stage.create({ data: { programId: program.id, kind: StageKind.LESSON, ordinal: 3, nameAr: "الدرس الثالث", parentId: ch2.id } });

  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, circle, teacher, student, manager };
}

/** يرصد حضور الطالب هذا اليوم بحالةٍ معيّنة (الافتراض: حاضر). */
async function markAttendance(studentId: string, circleId: string, recordedBy: string, status: AttendanceStatus = AttendanceStatus.PRESENT) {
  await prisma.attendance.create({ data: { studentId, circleId, date: new Date(DATE), status, recordedBy } });
}

describe("حالة الجلسة «مؤجَّل» — توثيقٌ محايد، لا ينقل الموضع", () => {
  it("يوثّق التأجيل (QaidahDailyEval) ولا يحرّك الموضع", async () => {
    const { teacher, circle, student } = await scaffold();
    await markAttendance(student.id, circle.id, teacher.id);

    const before = await getQaidahPosition(student.id, prisma);
    // تأجيل القاعدة يمرّ عبر recordQaidahSession(DEFERRED) ⟵ QaidahDailyEval (قرار أ).
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, result: QaidahEvalResult.DEFERRED, date: DATE }, prisma);
    const after = await getQaidahPosition(student.id, prisma);

    expect(after.current?.lessonId).toBe(before.current?.lessonId); // الموضع ثابت
    expect(after.completedLessons).toBe(0);
    expect(after.deferredIsLatest).toBe(true); // آخر تقييمٍ مؤجَّل
    const rows = await prisma.qaidahDailyEval.count({ where: { studentId: student.id, result: QaidahEvalResult.DEFERRED } });
    expect(rows).toBe(1);
  });

  it("لا يمنح ولا يخصم نقاطاً", async () => {
    const { teacher, circle, student } = await scaffold();
    await markAttendance(student.id, circle.id, teacher.id);
    await deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(0);
    expect(await prisma.pointTransaction.count({ where: { studentId: student.id } })).toBe(0);
  });

  it("يتطلّب حضوراً — لا يُسجَّل لغائب (بلا رصدٍ أصلاً)", async () => {
    const { teacher, student } = await scaffold();
    await expect(
      deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("يتطلّب حضوراً — لا يُسجَّل لغائبٍ مرصودٍ غياباً", async () => {
    const { teacher, circle, student } = await scaffold();
    await markAttendance(student.id, circle.id, teacher.id, AttendanceStatus.ABSENT_UNEXCUSED);
    await expect(
      deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("معلّمٌ ليس معلّم الطالب ← يُرفض", async () => {
    const { circle, student, teacher } = await scaffold();
    await markAttendance(student.id, circle.id, teacher.id);
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      deferSession({ studentId: student.id, actorId: stranger.id, date: DATE }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("idempotent — مؤجَّل مرّةً لليوم", async () => {
    const { teacher, circle, student } = await scaffold();
    await markAttendance(student.id, circle.id, teacher.id);
    await deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma);
    await deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma);
    expect(await prisma.deferredSession.count({ where: { studentId: student.id } })).toBe(1);
  });

  it("التأجيل لا يمنع التقدّم اللاحق؛ و«متقن» يُلغي أسبقية «مؤجَّل» في العرض", async () => {
    const { teacher, student } = await scaffold();
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, result: QaidahEvalResult.DEFERRED, date: "2026-05-10" }, prisma);
    expect((await getQaidahPosition(student.id, prisma)).deferredIsLatest).toBe(true);

    const after = await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-11" }, prisma);
    expect(after.completedLessons).toBe(1); // تقدّم فعلاً
    expect(after.deferredIsLatest).toBe(false); // التقدّم بعد التأجيل ⟵ ليس آخرَ تقييم
  });
});
