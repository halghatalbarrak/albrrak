import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listStudentsForAdmin, revealStudentNationalId, softDeleteStudent } from "../students";
import { encryptNationalId } from "../national-id";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// طالبٌ مقبول: عمرٌ، حلقةٌ منتسبٌ إليها، وليٌّ، ورقم هوية مشفَّر.
async function acceptedStudent() {
  const program = await createProgram(prisma);
  const circle = await createCircle(prisma, program.id);
  const user = await createUser(prisma, {
    roles: [Role.STUDENT],
    nationalId: encryptNationalId("1099887766"),
  });
  await prisma.user.update({ where: { id: user.id }, data: { birthDate: new Date("2012-01-01") } });
  const student = await prisma.student.create({ data: { userId: user.id, state: "IN_MARAQI" } });
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
  const guardian = await createUser(prisma, { roles: [Role.GUARDIAN] });
  await prisma.user.update({ where: { id: guardian.id }, data: { phone: "0555123456" } });
  await prisma.guardianLink.create({ data: { guardianId: guardian.id, studentId: student.id } });
  return { student, circle, user };
}

describe("قائمة الطلاب للمدير", () => {
  it("لا تظهر الطلاب المحذوفون ناعمًا في قائمة المدير", async () => {
    const { student } = await acceptedStudent();
    // إنهاء الانتساب ثم حذف
    await prisma.enrollment.updateMany({ where: { studentId: student.id, endedAt: null }, data: { endedAt: new Date() } });
    await prisma.student.update({ where: { id: student.id }, data: { deletedAt: new Date() } });
    const rows = await listStudentsForAdmin(prisma, new Date("2026-01-01"));
    expect(rows.find((r) => r.id === student.id)).toBeUndefined();
  });

  it("كل سطر يحمل العمر (محسوب) والحلقة والولي، وبلا رقم هوية", async () => {
    const { student, circle } = await acceptedStudent();
    const rows = await listStudentsForAdmin(prisma, new Date("2026-01-01"));
    const row = rows.find((r) => r.id === student.id);
    expect(row?.age).toBe(14); // ٢٠١٢ ← ٢٠٢٦
    expect(row?.circle).toBe(circle.nameAr);
    expect(row?.guardian).toContain("0555123456");
    expect(JSON.stringify(rows)).not.toContain("nationalId");
    expect(JSON.stringify(rows)).not.toContain("1099887766");
  });
});

describe("كشف رقم هوية طالبٍ مقبول — للمُسجِّل فقط، بسطر اطّلاع (م٥)", () => {
  it("مُسجِّل ← يرى الرقم، ويُكتب سطرٌ في سجل الاطّلاع", async () => {
    const { student, user } = await acceptedStudent();
    const registrar = await createUser(prisma, { roles: [Role.REGISTRAR] });
    const id = await revealStudentNationalId({
      studentId: student.id,
      viewerId: registrar.id,
      viewerRoles: [Role.REGISTRAR],
    });
    expect(id).toBe("1099887766");
    expect(await prisma.nationalIdAccessLog.count({ where: { subjectId: user.id } })).toBe(1);
  });

  it("معلّم ← يُرفض بلا سطر اطّلاع", async () => {
    const { student } = await acceptedStudent();
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      revealStudentNationalId({
        studentId: student.id,
        viewerId: teacher.id,
        viewerRoles: [Role.TEACHER],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await prisma.nationalIdAccessLog.count()).toBe(0);
  });
});

describe("softDeleteStudent — الحذف الناعم", () => {
  it("يرمي studentNotFound إن لم يوجد الطالب", async () => {
    await expect(softDeleteStudent("actor", "nonexistent-id", prisma))
      .rejects.toMatchObject({ key: "studentNotFound" });
  });

  it("يرمي studentHasActiveEnrollment إن كان لديه انتساب نشط", async () => {
    const { student } = await acceptedStudent();
    await expect(softDeleteStudent("actor", student.id, prisma))
      .rejects.toMatchObject({ key: "studentHasActiveEnrollment" });
  });

  it("يحذف ناعماً طالباً بلا انتساب نشط ويكتب AuditLog", async () => {
    const { student } = await acceptedStudent();
    // إنهاء الانتساب النشط
    await prisma.enrollment.updateMany({ where: { studentId: student.id, endedAt: null }, data: { endedAt: new Date() } });
    const actor = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await softDeleteStudent(actor.id, student.id, prisma);
    const updated = await prisma.student.findUnique({ where: { id: student.id }, select: { deletedAt: true, deletedById: true } });
    expect(updated?.deletedAt).not.toBeNull();
    expect(updated?.deletedById).toBe(actor.id);
    const log = await prisma.auditLog.findFirst({ where: { entity: "Student", entityId: student.id } });
    expect(log?.action).toBe("DELETE");
  });

  it("يرمي studentAlreadyDeleted إن كان محذوفاً فعلاً", async () => {
    const { student } = await acceptedStudent();
    await prisma.enrollment.updateMany({ where: { studentId: student.id, endedAt: null }, data: { endedAt: new Date() } });
    const actor = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await softDeleteStudent(actor.id, student.id, prisma);
    await expect(softDeleteStudent(actor.id, student.id, prisma))
      .rejects.toMatchObject({ key: "studentAlreadyDeleted" });
  });

  it("يستعمل ValidationError لأخطاء القاعدة", async () => {
    await expect(softDeleteStudent("actor", "nonexistent-id", prisma))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
