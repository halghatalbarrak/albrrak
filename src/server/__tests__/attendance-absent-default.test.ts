import { AttendanceStatus, ProgressState, ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ABSENT_DEFAULT_FROM, defaultStatusFor, recordSession, getSessionRoster } from "../attendance";
import { getUnifiedBoard } from "../unified-session";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══ قلب الأصل إلى «غياب» (م ج) — يسري من العتبة فصاعدًا فقط، بلا أثر رجعيّ ═══

// يومٌ قبل العتبة ويومٌ فيها (نصّ ISO) — للتمييز الصريح بين الماضي والحاضر/المستقبل.
const CUT = ABSENT_DEFAULT_FROM;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const BEFORE = iso(new Date(Date.UTC(CUT.getUTCFullYear(), CUT.getUTCMonth(), CUT.getUTCDate() - 1)));
const ON = iso(CUT);
const AFTER = iso(new Date(Date.UTC(CUT.getUTCFullYear(), CUT.getUTCMonth(), CUT.getUTCDate() + 7)));

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const stage = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "الباب الأول" },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  await prisma.stageProgress.create({
    data: { studentId: student.id, stageId: stage.id, state: ProgressState.IN_PROGRESS, startedAt: new Date(), attendanceDays: 0 },
  });
  return { program, stage, circle, teacher, student };
}

const statusOf = (studentId: string, date: string) =>
  prisma.attendance.findUnique({ where: { studentId_date: { studentId, date: new Date(date) } }, select: { status: true } });

describe("العتبة (defaultStatusFor) — الحدّ الفاصل", () => {
  it("قبل العتبة ← حاضر؛ فيها وبعدها ← غياب", () => {
    expect(defaultStatusFor(BEFORE)).toBe(AttendanceStatus.PRESENT);
    expect(defaultStatusFor(ON)).toBe(AttendanceStatus.ABSENT_UNEXCUSED);
    expect(defaultStatusFor(AFTER)).toBe(AttendanceStatus.ABSENT_UNEXCUSED);
  });
});

describe("لا أثر رجعيّ — الأيّام السابقة للنشر تبقى حاضرة", () => {
  it("رصد يومٍ ماضٍ بلا استثناءات ← يُشتقّ حاضرًا (كالأصل القديم)", async () => {
    const { circle, teacher, student } = await scaffold();
    const res = await recordSession({ circleId: circle.id, date: BEFORE, exceptions: [], recorderId: teacher.id }, prisma);
    expect(res).toEqual({ total: 1, present: 1, absent: 0 });
    expect((await statusOf(student.id, BEFORE))?.status).toBe(AttendanceStatus.PRESENT);
  });

  it("سجلّ حضورٍ ماضٍ مخزّنٌ لا يُمَسّ بعد القلب", async () => {
    const { circle, teacher, student } = await scaffold();
    // يومٌ ماضٍ رُصد حاضرًا (سجلّ ثابت).
    await recordSession({ circleId: circle.id, date: BEFORE, exceptions: [], recorderId: teacher.id }, prisma);
    // ثمّ نشاطٌ في يومٍ جديد (بعد العتبة) — لا يعيد كتابة الماضي.
    await recordSession({ circleId: circle.id, date: AFTER, exceptions: [], recorderId: teacher.id }, prisma);
    expect((await statusOf(student.id, BEFORE))?.status).toBe(AttendanceStatus.PRESENT); // الماضي كما هو
  });
});

describe("الأيّام الجديدة — الأصل غياب", () => {
  it("رصد يومٍ في/بعد العتبة بلا استثناءات ← يُشتقّ غيابًا ولا يُحتسب يوم حضور", async () => {
    const { circle, teacher, student, stage } = await scaffold();
    const res = await recordSession({ circleId: circle.id, date: AFTER, exceptions: [], recorderId: teacher.id }, prisma);
    expect(res).toEqual({ total: 1, present: 0, absent: 1 });
    expect((await statusOf(student.id, AFTER))?.status).toBe(AttendanceStatus.ABSENT_UNEXCUSED);
    const p = await prisma.stageProgress.findFirstOrThrow({ where: { studentId: student.id, stageId: stage.id } });
    expect(p.attendanceDays).toBe(0); // الغياب لا يُحتسب
  });

  it("قائمة العرض (getSessionRoster): الفراغ يظهر غيابًا بعد العتبة، حاضرًا قبلها", async () => {
    const { circle, student } = await scaffold();
    const rAfter = await getSessionRoster(circle.id, AFTER, prisma);
    expect(rAfter.find((r) => r.studentId === student.id)?.status).toBe(AttendanceStatus.ABSENT_UNEXCUSED);
    const rBefore = await getSessionRoster(circle.id, BEFORE, prisma);
    expect(rBefore.find((r) => r.studentId === student.id)?.status).toBe(AttendanceStatus.PRESENT);
  });
});

describe("الحالات الحديّة (م ج) — سلامة اللوحة الموحّدة", () => {
  it("حلقةٌ بلا طلاب ← لوحةٌ فارغة وعَلَمُ الأصل مضبوط، بلا انهيار", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const circle = await prisma.circle.create({ data: { nameAr: "خالية", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
    const teacher = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const board = await getUnifiedBoard(teacher.id, circle.id, AFTER, prisma);
    expect(board.students).toEqual([]);
    expect(board.absentDefault).toBe(true);
    const past = await getUnifiedBoard(teacher.id, circle.id, BEFORE, prisma);
    expect(past.absentDefault).toBe(false); // قبل العتبة: الأصل حاضر
  });

  it("طالبٌ واحدٌ لم يُرفَع ← attendanceStatus = null وعَلَمُ الأصل غياب", async () => {
    const { circle, teacher, student } = await scaffold();
    const board = await getUnifiedBoard(teacher.id, circle.id, AFTER, prisma);
    expect(board.absentDefault).toBe(true);
    const row = board.students.find((s) => s.studentId === student.id);
    expect(row?.attendanceStatus).toBeNull(); // اللوحة تُبقي الفراغ صريحًا؛ العَلَم يقود العرض
  });
});
