import { ApprovalKind, ProgramKey, ProgressState, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { declareHasadReadiness, recordHasad } from "../hasad";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// الحكم ٧ (محدَّث): انتقال الحزب تلقائيٌّ بحصاده — بلا اعتماد. الاختبار المحايد + اعتماد
// المدير للمراحل الأصلية والتخرّج فقط (مؤجَّل). اختبارٌ يثبت الفصل.

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية الأولى" },
  });
  const sub = await prisma.stage.create({
    data: {
      programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "ح٦٠",
      parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6,
    },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  return { program, main, sub, teacher, student, reciter };
}

const progress = (studentId: string, stageId: string) =>
  prisma.stageProgress.findUnique({ where: { studentId_stageId: { studentId, stageId } } });

describe("انتقال الحزب (الحكم ٧) — تلقائيٌّ بلا اعتماد", () => {
  it("نجاح حصاد الحزب ← يُتمّه (COMPLETED) بلا أيّ اعتماد", async () => {
    const { sub, teacher, student, reciter } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: sub.id, teacherId: teacher.id }, prisma);
    await recordHasad({ studentId: student.id, stageId: sub.id, reciterId: reciter.id, errors: [] }, prisma);

    const p = await progress(student.id, sub.id);
    expect(p?.state).toBe(ProgressState.COMPLETED);
    // بلا اعتماد: لا اعتماد انتقالٍ فرعيّ أُنشئ إطلاقًا.
    expect(await prisma.approval.count({ where: { kind: ApprovalKind.SUBSTAGE_TRANSITION } })).toBe(0);
    // أُصدِر حدث الانتقال التلقائيّ.
    expect(await prisma.event.count({ where: { type: "SUBSTAGE_TRANSITION" } })).toBe(1);
  });

  it("رسوب الحصاد ← لا انتقال (يبقى بانتظار الحصاد)", async () => {
    const { sub, teacher, student, reciter } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: sub.id, teacherId: teacher.id }, prisma);
    // ستّة أخطاء على الحزب ← رسوب (الحكم ٧: ≥٦).
    await recordHasad(
      { studentId: student.id, stageId: sub.id, reciterId: reciter.id, errors:
        Array.from({ length: 6 }, () => ({ pageNo: 5, errorType: "WORD" as const })),
      },
      prisma,
    );
    const p = await progress(student.id, sub.id);
    expect(p?.state).toBe(ProgressState.AWAITING_HASAD); // لم ينتقل
  });

  it("المرحلة الأصلية لا تنتقل ولا تخرّجَ تلقائيًّا (تحتاج اعتمادًا محايدًا — مؤجَّل)", async () => {
    const { main, sub, teacher, student, reciter } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: sub.id, teacherId: teacher.id }, prisma);
    await recordHasad({ studentId: student.id, stageId: sub.id, reciterId: reciter.id, errors: [] }, prisma);

    // المرحلة الأصلية لم تُتمّ (لا StageProgress لها).
    expect(await progress(student.id, main.id)).toBeNull();
    // ولا تخرّج: الطالب ما زال في مراقي.
    const s = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(s.state).toBe(StudentState.IN_MARAQI);
  });
});
