import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { assertTeacherOwnsCircle, createCircle } from "../circles";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle as factoryCircle, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("assertTeacherOwnsCircle", () => {
  it("يرمي AuthorizationError إن لم يكن المعلّم مرتبطاً بالحلقة", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const circle = await factoryCircle(prisma);
    await expect(assertTeacherOwnsCircle(teacher.id, circle.id)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("يمرّ إن كان المعلّم مرتبطاً بالحلقة (endedAt = null)", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const circle = await factoryCircle(prisma);
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
    await expect(assertTeacherOwnsCircle(teacher.id, circle.id)).resolves.toBeUndefined();
  });

  it("يرمي AuthorizationError إن انتهى الارتباط (endedAt موجود)", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const circle = await factoryCircle(prisma);
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id, endedAt: new Date() } });
    await expect(assertTeacherOwnsCircle(teacher.id, circle.id)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("createCircle مع معلّم", () => {
  it("ينشئ CircleTeacher تلقائياً إن أُعطي teacherId", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const circle = await createCircle({ nameAr: "حلقة-الاختبار", timeSlot: "MAGHRIB", gender: "MALE", teacherId: teacher.id }, prisma);
    const link = await prisma.circleTeacher.findFirst({ where: { circleId: circle.id, teacherId: teacher.id } });
    expect(link).not.toBeNull();
  });

  it("يرمي خطأ تحقّق إن لم يكن المستخدم لديه دور معلّم", async () => {
    const user = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await expect(
      createCircle({ nameAr: "حلقة-الاختبار", timeSlot: "MAGHRIB", gender: "MALE", teacherId: user.id }, prisma)
    ).rejects.toHaveProperty("key", "teacherNotFound");
  });
});
