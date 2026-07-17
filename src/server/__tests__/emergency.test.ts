import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { revealEmergencyContact } from "../emergency";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import {
  createCircle,
  createGuardianRelation,
  createProgram,
  createStudent,
  createUser,
} from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// طالبٌ منتسبٌ لحلقة، ومعلّمها، ومعلّمٌ آخر خارجها — لاختبار «لطلابه هو فقط».
async function scene() {
  const program = await createProgram(prisma);
  const circle = await createCircle(prisma, program.id);
  const rel = await createGuardianRelation(prisma);
  const { student } = await createStudent(prisma);
  await prisma.student.update({
    where: { id: student.id },
    data: {
      emergencyName: "أبو فلان",
      emergencyPhone: "0555111222",
      emergencyRelationId: rel.id,
    },
  });
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });

  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });

  return { circle, student, teacher, relName: rel.nameAr };
}

describe("كشف جهة الطوارئ — لمعلّم الطالب فقط، بسطرِ اطّلاع", () => {
  it("معلّم الطالب ← يرى الجهة، ويُكتب سطرٌ في EmergencyAccessLog", async () => {
    const s = await scene();
    const contact = await revealEmergencyContact({
      actorId: s.teacher.id,
      studentId: s.student.id,
    });
    expect(contact.name).toBe("أبو فلان");
    expect(contact.phone).toBe("0555111222");
    expect(contact.relation).toBe(s.relName);
    expect(
      await prisma.emergencyAccessLog.count({ where: { studentId: s.student.id } }),
    ).toBe(1);
  });

  it("معلّمٌ لطالبٍ ليس له ← يُرفض في الخادم، بلا سطر اطّلاع", async () => {
    const s = await scene();
    const other = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      revealEmergencyContact({ actorId: other.id, studentId: s.student.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      await prisma.emergencyAccessLog.count({ where: { studentId: s.student.id } }),
    ).toBe(0);
  });

  it("عريفٌ (ليس معلّم الحلقة) ← يُرفض", async () => {
    const s = await scene();
    const arif = await createUser(prisma, { roles: [Role.ARIF] });
    await expect(
      revealEmergencyContact({ actorId: arif.id, studentId: s.student.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("معلّمٌ انتهت مدّته في الحلقة ← يُرفض (endedAt ليست null)", async () => {
    const s = await scene();
    await prisma.circleTeacher.update({
      where: { circleId_teacherId: { circleId: s.circle.id, teacherId: s.teacher.id } },
      data: { endedAt: new Date() },
    });
    await expect(
      revealEmergencyContact({ actorId: s.teacher.id, studentId: s.student.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
