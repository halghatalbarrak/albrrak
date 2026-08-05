import { ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordMurajaah, recordTarseekh } from "../daily-session";
import { declareHasadReadiness, recordHasad } from "../hasad";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// الحكم ٦ (تمييز حاسم): التسميع (ترسيخ/مراجعة) مرنٌ — مسموحٌ لمعلّم الطالب. أما الاختبار
// (الحصاد/الترقية/المحطة) فمحايد — معلّم الطالب ممنوعٌ منه. اختبارٌ يثبت الفصل في الخادم.

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
  return { teacher, student, sub };
}

describe("الحكم ٦ — التسميع مرن، الاختبار محايد", () => {
  it("المعلّم يُسمِّع طالبه (ترسيخ ومراجعة) — مسموح", async () => {
    const { teacher, student } = await scaffold();
    await expect(
      recordTarseekh({ studentId: student.id, date: "2026-05-10", done: true, actorId: teacher.id }, prisma),
    ).resolves.toBeUndefined();
    await expect(
      recordMurajaah({ studentId: student.id, date: "2026-05-10", done: true, actorId: teacher.id }, prisma),
    ).resolves.toBeUndefined();
  });

  it("المعلّم لا يحصد (يختبر) طالبه — ممنوع في الخادم", async () => {
    const { teacher, student, sub } = await scaffold();
    // حتى مع إعلان الجاهزية، الحصاد على معلّمه مرفوضٌ (assertCanExamine أولًا).
    await declareHasadReadiness({ studentId: student.id, stageId: sub.id, teacherId: teacher.id }, prisma);
    await expect(
      recordHasad({ studentId: student.id, stageId: sub.id, reciterId: teacher.id, errors: [] }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
