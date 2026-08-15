import { ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appointArif,
  dismissArif,
  isActiveArifForCircle,
  listCircleArifs,
} from "../arif";
import { recordHifz, recordMurajaah, recordTarseekh } from "../daily-session";
import { canExamine } from "../examiner-eligibility";
import { recordHasad } from "../hasad";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// حلقة مراقي بمعلّمها، وطالبان منتسبان: أحدهما عريفٌ محتمَل، والآخر زميلٌ يُسمِّع له العريف.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const arif = await createStudent(prisma); // { user, student }
  const peer = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: arif.student.id, circleId: circle.id } });
  await prisma.enrollment.create({ data: { studentId: peer.student.id, circleId: circle.id } });
  return { program, circle, teacher, arif, peer };
}

describe("تعيين العريف (الحكم ٨)", () => {
  it("المعلّم يعيّن طالباً من حلقته عريفاً", async () => {
    const { circle, teacher, arif } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await isActiveArifForCircle(arif.user.id, circle.id, prisma)).toBe(true);
    expect(await listCircleArifs(circle.id, prisma)).toHaveLength(1);
  });

  it("غير معلّم الحلقة لا يعيّن (يُرفض في الخادم)", async () => {
    const { circle, arif } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: stranger.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا يُعيَّن إلا طالبٌ منتسبٌ للحلقة نفسها", async () => {
    const { circle, teacher } = await scaffold();
    const outsider = await createStudent(prisma); // غير منتسب لهذه الحلقة
    await expect(
      appointArif({ circleId: circle.id, arifUserId: outsider.user.id, teacherId: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("حدود العريف (الحكم ٨) — يُسمِّع لا يختبر ولا حفظ جديد", () => {
  it("يُسمِّع الترسيخ والمراجعة (مسموح)، ويُسجَّل باسمه", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    await expect(
      recordTarseekh({ studentId: peer.student.id, date: "2026-05-10", done: true, actorId: arif.user.id }, prisma),
    ).resolves.toBeUndefined();
    await expect(
      recordMurajaah({ studentId: peer.student.id, date: "2026-05-10", count: 2, actorId: arif.user.id }, prisma),
    ).resolves.toBeUndefined();
    const row = await prisma.dailySession.findFirstOrThrow({ where: { studentId: peer.student.id } });
    expect(row.tarseekhListenerId).toBe(arif.user.id);
  });

  it("لا يُسمِّع الحفظ الجديد (حصريّ للمعلّم) — يُرفض", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    await expect(
      recordHifz(
        { studentId: peer.student.id, teacherId: arif.user.id, date: "2026-05-10", fromSurah: 90, fromAyah: 1, toSurah: 95, toAyah: 5, attempts: 1, mastered: true },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا يختبر (الاختبار محايد) — canExamine=false والحصاد يُرفض", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await canExamine({ examinerUserId: arif.user.id, studentId: peer.student.id }, prisma)).toBe(false);
    await expect(
      recordHasad({ studentId: peer.student.id, stageId: "x", reciterId: arif.user.id, errors: [] }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("بعد العزل: لا يُسمِّع", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    await dismissArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await isActiveArifForCircle(arif.user.id, circle.id, prisma)).toBe(false);
    await expect(
      recordTarseekh({ studentId: peer.student.id, date: "2026-05-11", done: true, actorId: arif.user.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
