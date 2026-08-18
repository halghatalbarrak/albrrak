import { ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getMyStudentSession } from "../me";
import { recordHifz } from "../daily-session";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة مراقي مصغّرة: برنامج + مرحلةٌ فرعية (حزب ٦٠ بحدوده) + حلقة ومعلّمها + طالبٌ منتسب.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "المرحلة الأولى" } });
  await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "الأعلى 1 - الناس 6", parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6 },
  });
  const circle = await prisma.circle.create({ data: { nameAr: "حلقة مراقي", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { user, student, teacher };
}

describe("getMyStudentSession (م٨) — لوحة الطالب عن نفسه", () => {
  it("بلا سجلّ طالب ← hasStudent=false", async () => {
    const u = await createUser(prisma, { roles: [] });
    const s = await getMyStudentSession(u.id, prisma, "2026-05-10");
    expect(s.hasStudent).toBe(false);
  });

  it("طالب مراقي بعد الحفظ ← موضعه بحدوده (بلا رقم حزب) + اقتراحاته", async () => {
    const { user, student, teacher } = await scaffold();
    await recordHifz({ studentId: student.id, teacherId: teacher.id, date: "2026-05-10", fromSurah: 90, fromAyah: 1, toSurah: 95, toAyah: 5, attempts: 2, mastered: true }, prisma);

    const s = await getMyStudentSession(user.id, prisma, "2026-05-11");
    expect(s.hasStudent).toBe(true);
    expect(s.program).toBe("MARAQI");
    expect(s.started).toBe(true);
    expect(s.positionLabel).toBeTruthy();
    expect(s.positionLabel).not.toContain("حزب"); // §٨٫٢: الطالب لا يرى «حزب»
    expect(s.suggestions).not.toBeNull();
    expect(s.today).not.toBeNull();
    expect(s.weekly).not.toBeNull();
  });
});
