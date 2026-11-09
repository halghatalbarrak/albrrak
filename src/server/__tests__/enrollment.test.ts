import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  enrollStudent,
  getActiveEnrollment,
  getEnrollmentHistory,
  transferStudent,
} from "../enrollment";
import { ValidationError } from "../errors";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function setup() {
  const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const c1 = await createCircle(prisma, program.id);
  const c2 = await createCircle(prisma, program.id);
  const { student } = await createStudent(prisma);
  const manager = await createUser(prisma);
  return { c1, c2, student, manager };
}

describe("إسناد الطلاب للحلقات (م١)", () => {
  it("الإسناد الأول ينشئ انتسابًا نشطًا ويُصدِر حدثًا", async () => {
    const { c1, student, manager } = await setup();
    const e = await enrollStudent({ studentId: student.id, circleId: c1.id, actorId: manager.id });
    expect(e.endedAt).toBeNull();
    expect(e.circleId).toBe(c1.id);
    const active = await getActiveEnrollment(student.id, prisma);
    expect(active?.circleId).toBe(c1.id);
    expect(await prisma.event.count({ where: { type: "STUDENT_ENROLLED" } })).toBe(1);
  });

  it("النقل يُنهي القديم وينشئ الجديد — بسجلٍّ تاريخي، ونشطٌ واحد فقط", async () => {
    const { c1, c2, student, manager } = await setup();
    await enrollStudent({ studentId: student.id, circleId: c1.id, actorId: manager.id });
    await enrollStudent({ studentId: student.id, circleId: c2.id, actorId: manager.id });

    const active = await getActiveEnrollment(student.id, prisma);
    expect(active?.circleId).toBe(c2.id);

    const activeCount = await prisma.enrollment.count({
      where: { studentId: student.id, endedAt: null },
    });
    expect(activeCount).toBe(1);

    const history = await getEnrollmentHistory(student.id, prisma);
    expect(history).toHaveLength(2);
    expect(history.filter((h) => h.endedAt !== null)).toHaveLength(1); // القديم مُنهى
    expect(await prisma.event.count({ where: { type: "STUDENT_TRANSFERRED" } })).toBe(1);
  });

  it("إعادة الإسناد لنفس الحلقة ← ValidationError (لا عملية)", async () => {
    const { c1, student, manager } = await setup();
    await enrollStudent({ studentId: student.id, circleId: c1.id, actorId: manager.id });
    await expect(
      enrollStudent({ studentId: student.id, circleId: c1.id, actorId: manager.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("حلقةٌ واحدة تجمع برنامجين: كلّ طالبٍ يقرأ برنامجه من قيده لا من الحلقة", async () => {
    const qaidah = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, null); // حلقةٌ بلا برنامج (مختلطة)
    const a = await createStudent(prisma);
    const b = await createStudent(prisma);
    const manager = await createUser(prisma);
    await enrollStudent({ studentId: a.student.id, circleId: circle.id, programId: qaidah.id, actorId: manager.id });
    await enrollStudent({ studentId: b.student.id, circleId: circle.id, programId: maraqi.id, actorId: manager.id });
    expect((await getActiveEnrollment(a.student.id, prisma))?.programKey).toBe(ProgramKey.QAIDAH_MADANIYYAH);
    expect((await getActiveEnrollment(b.student.id, prisma))?.programKey).toBe(ProgramKey.MARAQI);
  });

  it("حلقةٌ بلا برنامجٍ والبرنامج غير مُختار ← ValidationError (البرنامج مطلوب)", async () => {
    const circle = await createCircle(prisma, null);
    const { student } = await createStudent(prisma);
    const manager = await createUser(prisma);
    await expect(
      enrollStudent({ studentId: student.id, circleId: circle.id, actorId: manager.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("القاعدة المطلقة: انتسابان نشطان مباشرةً في القاعدة ← تَرفضهما القاعدة (partial unique index)", async () => {
    const { c1, c2, student } = await setup();
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: c1.id } });
    // تجاوزٌ متعمّد للوحدة — الفهرس الجزئيّ يجب أن يرفض النشط الثاني (لا يقرأ البرنامج).
    await expect(
      prisma.enrollment.create({ data: { studentId: student.id, circleId: c2.id } }),
    ).rejects.toThrow();
    const activeCount = await prisma.enrollment.count({
      where: { studentId: student.id, endedAt: null },
    });
    expect(activeCount).toBe(1);
  });
});

describe("transferStudent — النقل الصحيح", () => {
  it("ينقل طالباً في حالة AWAITING_READING_TEST بلا برنامج — الحالة لا تتغيّر", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const c1 = await createCircle(prisma, null); // بلا برنامج
    const c2 = await createCircle(prisma, null);
    const { student } = await createStudent(prisma);
    const manager = await createUser(prisma);
    // انتساب مباشر بلا برنامج (تجاوز enrollStudent المُقيَّد)
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: c1.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: "AWAITING_READING_TEST" } });

    const { enrollmentId } = await transferStudent(manager.id, student.id, c2.id, prisma);

    const updated = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { circleId: true } });
    expect(updated?.circleId).toBe(c2.id);
    // انتساب نشط واحد فقط
    expect(await prisma.enrollment.count({ where: { studentId: student.id, endedAt: null } })).toBe(1);
    // الحالة لم تتغيّر
    const s = await prisma.student.findUnique({ where: { id: student.id }, select: { state: true } });
    expect(s?.state).toBe("AWAITING_READING_TEST");
    // سُجِّل في AuditLog
    expect(await prisma.auditLog.count({ where: { entity: "Student", entityId: student.id, action: "TRANSFER" } })).toBe(1);
    void program; // مُنشأ للبيئة
  });

  it("ينقل طالباً له انتساب نشط — تُحدَّث الحلقة ويبقى البرنامج", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const c1 = await createCircle(prisma, program.id);
    const c2 = await createCircle(prisma, program.id);
    const { student } = await createStudent(prisma);
    const manager = await createUser(prisma);
    await enrollStudent({ studentId: student.id, circleId: c1.id, programId: program.id, actorId: manager.id }, prisma);

    const before = await prisma.enrollment.findFirst({ where: { studentId: student.id, endedAt: null }, select: { programId: true } });
    const { enrollmentId } = await transferStudent(manager.id, student.id, c2.id, prisma);

    const after = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { circleId: true, programId: true } });
    expect(after?.circleId).toBe(c2.id);
    expect(after?.programId).toBe(before?.programId); // البرنامج لم يتغيّر
    expect(await prisma.enrollment.count({ where: { studentId: student.id, endedAt: null } })).toBe(1); // لم يُنشأ انتساب جديد
  });

  it("يرمي circleNotFound عند حلقة غير موجودة", async () => {
    const c1 = await createCircle(prisma, null);
    const { student } = await createStudent(prisma);
    const manager = await createUser(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: c1.id } });
    await expect(transferStudent(manager.id, student.id, "nonexistent", prisma))
      .rejects.toMatchObject({ key: "circleNotFound" });
  });

  it("يرمي studentAlreadyInThisCircle عند النقل للحلقة الحالية", async () => {
    const c1 = await createCircle(prisma, null);
    const { student } = await createStudent(prisma);
    const manager = await createUser(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: c1.id } });
    await expect(transferStudent(manager.id, student.id, c1.id, prisma))
      .rejects.toMatchObject({ key: "studentAlreadyInThisCircle" });
  });

  it("النقل لحلقة بجنسٍ مختلف ينجح (تنبيهٌ للواجهة فقط)", async () => {
    const c1 = await createCircle(prisma, null); // MALE
    const c2 = await prisma.circle.create({ data: { nameAr: "حلقة-بنات", timeSlot: "MAGHRIB", gender: "FEMALE" } });
    const { student } = await createStudent(prisma);
    const manager = await createUser(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: c1.id } });
    // يجب أن ينجح بلا رمي
    await expect(transferStudent(manager.id, student.id, c2.id, prisma)).resolves.toBeDefined();
  });
});
