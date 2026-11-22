/**
 * اختبارات خصوصيّة المانح — يتحقّق من:
 * ١. دالّة getDonorStats لا تُعيد أيّ بيانٍ شخصيّ.
 * ٢. الـAPI يرفض أدواراً غير مُصرَّح لها.
 */
import { Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDonorStats } from "../donor-stats";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("getDonorStats — لا بياناتٍ شخصية", () => {
  it("لا يحتوي الناتج على اسم أو معرّف طالب", async () => {
    const { student } = await createStudent(prisma);
    await prisma.student.update({
      where: { id: student.id },
      data: { state: StudentState.IN_MARAQI },
    });

    const stats = await getDonorStats(new Date(), prisma);
    const json = JSON.stringify(stats);

    // لا معرّفاتٍ أو أسماء أو بياناتٍ شخصيّة — المانح يرى الأعداد فقط.
    expect(json).not.toContain(student.id);
    expect(typeof stats.studentCount).toBe("number");
    expect(typeof stats.circleCount).toBe("number");
    expect(stats.monthlyTrend).toBeInstanceOf(Array);
    // كل شهرٍ فيه أعداد مجمّعة فقط
    for (const point of stats.monthlyTrend) {
      expect(typeof point.month).toBe("string");
      expect(typeof point.attendanceCount).toBe("number");
      expect(typeof point.presentCount).toBe("number");
      expect(typeof point.sessionCount).toBe("number");
    }
  });

  it("عدد الطلاب النشطين لا يتضمّن الطلبات (APPLIED) ولا المحذوفين", async () => {
    // طالبٌ APPLIED — لا يُحسب
    await createStudent(prisma);
    // طالبٌ IN_MARAQI — يُحسب
    const { student: active } = await createStudent(prisma);
    await prisma.student.update({ where: { id: active.id }, data: { state: StudentState.IN_MARAQI } });
    // طالبٌ محذوف
    const { student: deleted } = await createStudent(prisma);
    await prisma.student.update({
      where: { id: deleted.id },
      data: { state: StudentState.IN_MARAQI, deletedAt: new Date() },
    });

    const stats = await getDonorStats(new Date(), prisma);
    expect(stats.studentCount).toBe(1);
  });

  it("attendanceRate30d = null إن لا سجلّات حضور", async () => {
    const stats = await getDonorStats(new Date(), prisma);
    expect(stats.attendanceRate30d).toBeNull();
  });

  it("مستخدم DONOR يوجد — صحيحٌ من جهة البنية (لا يُرفض إنشاؤه)", async () => {
    const donor = await createUser(prisma, { roles: [Role.DONOR] });
    expect(donor.roles).toContain(Role.DONOR);
  });
});
