/**
 * لوحة عمل المدير — اختبارات الخادم.
 * يتحقّق من:
 * ١. ظهور الطالب الغائب يومَين في قائمة «يحتاجون متابعة».
 * ٢. ظهور الطالب بمقطع متكرّر (٣ محاولات، يومَين) في القائمة.
 * ٣. المعلّم لا يرى طلّاب حلقةٍ أخرى.
 * ٤. المانح لا يرى الأسماء (donorMode=true).
 */
import { AttendanceStatus, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDashboardData } from "../dashboard";
import { prisma, resetDb } from "../testing/helpers";
import { createUser, createStudent, createCircle } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function enrollStudentInCircle(studentId: string, circleId: string) {
  return prisma.enrollment.create({
    data: { studentId, circleId, startedAt: new Date() },
  });
}

async function setStudentState(studentId: string, state: StudentState) {
  return prisma.student.update({ where: { id: studentId }, data: { state } });
}

// ── اختبار ١: غياب متتالٍ ─────────────────────────────────────────────────────

describe("لوحة العمل — غياب متتالٍ", () => {
  it("يظهر الطالب الغائب يومَين في يحتاجون متابعة", async () => {
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student } = await createStudent(prisma);
    const circle = await createCircle(prisma);
    await enrollStudentInCircle(student.id, circle.id);
    await setStudentState(student.id, StudentState.IN_MARAQI);

    // اليوم = الأحد (٠ = school day)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    // اجعل اليوم يوم الأحد (school day)
    while (today.getUTCDay() !== 0) today.setUTCDate(today.getUTCDate() - 1);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    // تأكّد أنّ الأمس أيضاً يوم دراسيّ (يعني السبت — ليس دراسيّاً!)
    // دعنا نستخدم الخميس واليوم الذي قبله (الأربعاء) كيومَين دراسيَّين متتاليَين
    const thu = new Date(today);
    while (thu.getUTCDay() !== 4) thu.setUTCDate(thu.getUTCDate() - 1); // الخميس
    const wed = new Date(thu);
    wed.setUTCDate(wed.getUTCDate() - 1); // الأربعاء

    await prisma.attendance.createMany({
      data: [
        { studentId: student.id, circleId: circle.id, date: thu, status: AttendanceStatus.ABSENT_UNEXCUSED, recordedBy: manager.id },
        { studentId: student.id, circleId: circle.id, date: wed, status: AttendanceStatus.ABSENT_UNEXCUSED, recordedBy: manager.id },
      ],
    });

    const result = await getDashboardData([Role.CIRCLE_MANAGER], manager.id, new Date(thu.getTime() + 1000), prisma);

    const found = result.followUp.find((f) => f.studentId === student.id);
    expect(found).toBeDefined();
    expect(found?.reasons).toContain("ABSENT_CONSECUTIVE");
  });
});

// ── اختبار ٢: مقطع متكرّر ────────────────────────────────────────────────────

describe("لوحة العمل — مقطع متكرّر", () => {
  it("يظهر الطالب بمقطع متكرّر (٣ محاولات يومَين) في يحتاجون متابعة", async () => {
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student } = await createStudent(prisma);
    const circle = await createCircle(prisma);
    await enrollStudentInCircle(student.id, circle.id);
    await setStudentState(student.id, StudentState.IN_MARAQI);

    const thu = new Date();
    thu.setUTCHours(0, 0, 0, 0);
    while (thu.getUTCDay() !== 4) thu.setUTCDate(thu.getUTCDate() - 1);
    const wed = new Date(thu);
    wed.setUTCDate(wed.getUTCDate() - 1);

    await prisma.dailySession.createMany({
      data: [
        { studentId: student.id, circleId: circle.id, date: thu, hifzFromSurah: 2, hifzFromAyah: 1, hifzAttempts: 3, hifzMastered: false },
        { studentId: student.id, circleId: circle.id, date: wed, hifzFromSurah: 2, hifzFromAyah: 1, hifzAttempts: 3, hifzMastered: false },
      ],
    });

    const result = await getDashboardData([Role.CIRCLE_MANAGER], manager.id, new Date(thu.getTime() + 1000), prisma);

    const found = result.followUp.find((f) => f.studentId === student.id);
    expect(found).toBeDefined();
    expect(found?.reasons).toContain("REPEATED_SECTION");
  });
});

// ── اختبار ٣: المعلّم لا يرى غير حلقته ──────────────────────────────────────

describe("لوحة العمل — نطاق المعلّم", () => {
  it("المعلّم لا يرى طلّاب حلقةٍ أخرى", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const { student: s1 } = await createStudent(prisma);
    const { student: s2 } = await createStudent(prisma);
    const myCircle = await createCircle(prisma);
    const otherCircle = await createCircle(prisma);

    await prisma.circleTeacher.create({ data: { circleId: myCircle.id, teacherId: teacher.id } });
    await enrollStudentInCircle(s1.id, myCircle.id);
    await enrollStudentInCircle(s2.id, otherCircle.id);
    await setStudentState(s1.id, StudentState.IN_MARAQI);
    await setStudentState(s2.id, StudentState.IN_MARAQI);

    const result = await getDashboardData([Role.TEACHER], teacher.id, new Date(), prisma);

    const ids = result.students.map((s) => s.studentId);
    expect(ids).toContain(s1.id);
    expect(ids).not.toContain(s2.id);
  });
});

// ── اختبار ٤: المانح ─────────────────────────────────────────────────────────

describe("لوحة العمل — نطاق المانح", () => {
  it("المانح يحصل على donorMode=true وقوائم أسماء فارغة", async () => {
    const donor = await createUser(prisma, { roles: [Role.DONOR] });
    const result = await getDashboardData([Role.DONOR], donor.id, new Date(), prisma);
    expect(result.donorMode).toBe(true);
    expect(result.followUp).toHaveLength(0);
    expect(result.students).toHaveLength(0);
  });
});
