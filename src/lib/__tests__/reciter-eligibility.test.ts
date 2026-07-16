import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { canRecite } from "../reciter-eligibility";
import { prisma, resetDb } from "../../test/helpers";
import {
  createCircle,
  createProgram,
  createStudent,
  createUser,
} from "../../test/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("أهلية المُسمِّع للحصاد (م١ + م٣)", () => {
  it("م١: معلمُ الطالب في إحدى حلقاته ← يُرفض", async () => {
    const program = await createProgram(prisma);
    const circle = await createCircle(prisma, program.id);
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({
      data: { studentId: student.id, circleId: circle.id },
    });

    const teacher = await createUser(prisma, { roles: [Role.TEACHER, Role.RECITER] });
    await prisma.circleTeacher.create({
      data: { circleId: circle.id, teacherId: teacher.id },
    });

    expect(
      await canRecite(prisma, { reciterUserId: teacher.id, studentId: student.id }),
    ).toBe(false);
  });

  it("م٣: العريف ← يُرفض ولو لم يكن معلمه", async () => {
    const { student } = await createStudent(prisma);
    const arif = await createUser(prisma, { roles: [Role.ARIF, Role.RECITER] });
    expect(
      await canRecite(prisma, { reciterUserId: arif.id, studentId: student.id }),
    ).toBe(false);
  });

  it("مُسمِّع مستقلّ (لا يعلّمه ولا عريف) ← يجوز", async () => {
    const { student } = await createStudent(prisma);
    const reciter = await createUser(prisma, { roles: [Role.RECITER] });
    expect(
      await canRecite(prisma, { reciterUserId: reciter.id, studentId: student.id }),
    ).toBe(true);
  });
});
