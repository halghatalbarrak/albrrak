import { AttendanceStatus, ProgramKey, ProgressState, Role, StageKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordSession } from "../attendance";
import { deferSession } from "../session-deferral";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// المرحلة (أ): حالة حضورٍ خامسة «خرج بدون إذن» (LEFT_NO_PERMISSION) — إضافيّةٌ محضة، بلا قلب
// الأصل (يبقى حاضراً افتراضاً حتى الشاشة الموحّدة، م ج). لا تُحتسب حضورًا (خصمٌ لا حضور).

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const stage = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "الباب الأول" } });
  const circle = await prisma.circle.create({ data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.stageProgress.create({ data: { studentId: student.id, stageId: stage.id, state: ProgressState.IN_PROGRESS, startedAt: new Date(), attendanceDays: 0 } });
  return { circle, teacher, student, stage };
}

const DATE = "2026-05-10";
const days = (studentId: string, stageId: string) =>
  prisma.stageProgress.findUniqueOrThrow({ where: { studentId_stageId: { studentId, stageId } } }).then((p) => p.attendanceDays);
const mark = (circleId: string, teacherId: string, studentId: string, status: AttendanceStatus) =>
  recordSession({ circleId, date: DATE, exceptions: [{ studentId, status }], recorderId: teacherId }, prisma);

describe("الحضور الخماسيّ — المرحلة (أ): «خرج بدون إذن» إضافيّةٌ آمنة", () => {
  it("الحالة الجديدة تُقبَل وتُسجَّل", async () => {
    const { circle, teacher, student } = await scaffold();
    await mark(circle.id, teacher.id, student.id, AttendanceStatus.LEFT_NO_PERMISSION);
    const row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.LEFT_NO_PERMISSION);
  });

  it("«خرج بدون إذن» لا يُحتسب يوم حضور (خصمٌ لا حضور)", async () => {
    const { circle, teacher, student, stage } = await scaffold();
    await mark(circle.id, teacher.id, student.id, AttendanceStatus.LEFT_NO_PERMISSION);
    expect(await days(student.id, stage.id)).toBe(0);
    // وعكسها: حاضرٌ يُحتسب — تأكيدٌ أن العدّاد سليم.
    await mark(circle.id, teacher.id, student.id, AttendanceStatus.PRESENT);
    expect(await days(student.id, stage.id)).toBe(1);
  });

  it("الأصل ما زال «حاضر» (لم يُقلَب) — غير المُؤشَّر يُشتقّ حاضرًا", async () => {
    const { circle, teacher, student } = await scaffold();
    const res = await recordSession({ circleId: circle.id, date: DATE, exceptions: [], recorderId: teacher.id }, prisma);
    expect(res).toEqual({ total: 1, present: 1, absent: 0 });
    const row = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.status).toBe(AttendanceStatus.PRESENT);
  });

  it("«مؤجَّل» ما زال يعمل فوق «حاضر»، ويُرفض فوق «خرج بدون إذن»", async () => {
    const { circle, teacher, student } = await scaffold();
    // حاضر ← مؤجَّل يُقبل.
    await mark(circle.id, teacher.id, student.id, AttendanceStatus.PRESENT);
    await expect(deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma)).resolves.toBeTruthy();
    // خرج بدون إذن ← مؤجَّل يُرفض (لا يُحتسب حضورًا).
    await mark(circle.id, teacher.id, student.id, AttendanceStatus.LEFT_NO_PERMISSION);
    await expect(deferSession({ studentId: student.id, actorId: teacher.id, date: DATE }, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});
