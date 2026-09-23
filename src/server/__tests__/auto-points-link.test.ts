import { AttendanceStatus, AutoEventType, PointGrantSource, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPointItem, getBalance, grantAuto } from "../economy";
import { recordSession } from "../attendance";
import { recordHifz, recordMurajaah, recordTarseekh } from "../daily-session";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// المرحلة (ب): ربط النقاط التلقائيّة بأحداث الحضور والمهامّ. كل حدثٍ جديدٍ يُطلَق عند فعله.

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, circle, teacher, student, manager };
}

/** بند AUTO مربوطٌ بحدثٍ بقيمةٍ (موجب كسب، سالب خصم). */
const bind = (managerId: string, eventType: AutoEventType, value: number) =>
  createPointItem(managerId, { nameAr: `تلقائيّ-${eventType}`, value, grantSource: PointGrantSource.AUTO, eventType });

const DATE = "2026-05-10";

describe("ربط الحضور (م ب) — حدثٌ مفصّلٌ لكلّ حالة", () => {
  it("حاضر ⟵ ATTENDANCE_PRESENT (كسب)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    await recordSession({ circleId: circle.id, date: DATE, exceptions: [], recorderId: teacher.id }, prisma); // مشتقٌّ حاضرًا
    expect(await getBalance(student.id, prisma)).toBe(5);
  });

  it("غائب ⟵ ATTENDANCE_ABSENT (خصم)، وخرج بدون إذن ⟵ حدثه", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_ABSENT, -10);
    await recordSession({ circleId: circle.id, date: DATE, exceptions: [{ studentId: student.id, status: AttendanceStatus.ABSENT_UNEXCUSED }], recorderId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(-10);
  });

  it("«مستأذن» (بعذر) ⟵ لا حدث (صفر): لا يُطلق حدث الغياب", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_ABSENT, -10);
    await recordSession({ circleId: circle.id, date: DATE, exceptions: [{ studentId: student.id, status: AttendanceStatus.ABSENT_EXCUSED }], recorderId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(0); // لا خصم للمستأذن
  });

  it("منع الازدواج: إعادة رصد اليوم بالحالة نفسها لا تُكرّر المنح", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    const rec = () => recordSession({ circleId: circle.id, date: DATE, exceptions: [], recorderId: teacher.id }, prisma);
    await rec(); await rec();
    expect(await getBalance(student.id, prisma)).toBe(5); // مرّةً واحدة
  });

  it("لا ازدواج بين العام والمفصّل: الرصد يُطلق المفصّل فقط، لا ATTENDANCE العام (خامد)", async () => {
    const { circle, teacher, student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.ATTENDANCE_PRESENT, 5);
    await bind(manager.id, AutoEventType.ATTENDANCE, 100); // بندٌ على العام الخامد — يجب ألّا يُطلَق
    await recordSession({ circleId: circle.id, date: DATE, exceptions: [], recorderId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(5); // المفصّل فقط (لا ١٠٥)
  });
});

describe("ربط المهامّ (م ب) — تمّ/لم يتمّ", () => {
  it("الحفظ: أتقن ⟵ HIFZ_DONE (كسب)", async () => {
    const { student, teacher, manager } = await scaffold();
    await bind(manager.id, AutoEventType.HIFZ_DONE, 4);
    await recordHifz({ studentId: student.id, date: DATE, fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6, attempts: 1, mastered: true, teacherId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(4);
  });

  it("الحفظ: لم يُتقن ⟵ HIFZ_MISSED (خصم)", async () => {
    const { student, teacher, manager } = await scaffold();
    await bind(manager.id, AutoEventType.HIFZ_MISSED, -8);
    await recordHifz({ studentId: student.id, date: DATE, fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6, attempts: 3, mastered: false, teacherId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(-8);
  });

  it("الترسيخ: تمّ ⟵ TARSEEKH_DONE", async () => {
    const { student, teacher, manager } = await scaffold();
    await bind(manager.id, AutoEventType.TARSEEKH_DONE, 3);
    await recordTarseekh({ studentId: student.id, date: DATE, done: true, actorId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(3);
  });

  it("المراجعة: مقدارٌ موجب ⟵ MURAJAAH_DONE", async () => {
    const { student, teacher, manager } = await scaffold();
    await bind(manager.id, AutoEventType.MURAJAAH_DONE, 2);
    await recordMurajaah({ studentId: student.id, date: DATE, count: 5, actorId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(2);
  });
});

describe("الإنجاز الزائد (م ب) — EXTRA بوحدته", () => {
  it("HIFZ_EXTRA يُمنح بوحدته، ومنع الازدواج لكلّ وحدة", async () => {
    const { student, manager } = await scaffold();
    await bind(manager.id, AutoEventType.HIFZ_EXTRA, 2);
    expect(await grantAuto(prisma, AutoEventType.HIFZ_EXTRA, student.id, "unit-14")).toBeTruthy();
    expect(await grantAuto(prisma, AutoEventType.HIFZ_EXTRA, student.id, "unit-14")).toBeNull(); // نفس الوحدة ← لا تكرار
    expect(await grantAuto(prisma, AutoEventType.HIFZ_EXTRA, student.id, "unit-15")).toBeTruthy(); // وحدةٌ أخرى ← يُمنح
    expect(await getBalance(student.id, prisma)).toBe(4);
  });
});
