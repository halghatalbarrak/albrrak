import { AttendanceStatus, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { estimateKhatmDate } from "../estimate-khatm";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-06-01T12:00:00Z");
const BASE_DATE = new Date("2026-04-01T00:00:00Z"); // قبل ٨ أسابيع

/** ينشئ ٥ مسارات في برنامج مراقي بوحداتٍ تعطي نهايات السلّم. */
async function scaffoldTracks(programId: string) {
  const mk = async (ord: number, lpd: number, units: [number, number, number, number][]) => {
    const t = await prisma.track.create({
      data: { programId, nameAr: `م${ord}`, linesPerDay: lpd, ordinal: ord, isActive: true },
    });
    let n = 1;
    for (const u of units) {
      await prisma.trackUnit.create({
        data: { trackId: t.id, unitNo: n++, startSurah: u[0], startAyah: u[1], endSurah: u[2], endAyah: u[3] },
      });
    }
    return t;
  };
  // ترتيب حفظ مراقي: ١١٤ نزولاً حتى ٢
  // المسار ١: ٣ أسطر — حتى النبأ (٧٨)
  const t1 = await mk(1, 3, [[114, 1, 78, 1], [78, 2, 78, 40]]);
  // المسار ٢: ٥ أسطر — حتى المجادلة (٥٨)
  const t2 = await mk(2, 5, [[77, 1, 77, 50], [58, 1, 58, 22]]);
  // المسار ٣: نصف وجه — حتى الأحقاف (٤٦)
  const t3 = await mk(3, 7.5, [[57, 1, 57, 29], [46, 1, 46, 35]]);
  // المسار ٤: وجه — حتى العنكبوت (٢٩)
  const t4 = await mk(4, 15, [[45, 1, 45, 37], [29, 1, 29, 69]]);
  // المسار ٥: وجهان — حتى البقرة (٢)
  const t5 = await mk(5, 30, [[28, 1, 28, 88], [2, 1, 2, 286]]);
  return { t1, t2, t3, t4, t5 };
}

/** ينشئ حلقة + طالب + تسجيل. */
async function scaffoldStudent(programId: string) {
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { student, circle, teacher };
}

/** يُضيف سجلّات حضور. */
async function addAttendance(
  studentId: string,
  circleId: string,
  teacherId: string,
  count: number,
  presentCount: number,
  startDate: Date,
) {
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const status =
      i < presentCount ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT_UNEXCUSED;
    await prisma.attendance.create({
      data: { studentId, circleId, date: d, status, recordedBy: teacherId },
    });
  }
}

/** يُضيف جلسة حفظ للطالب (تُحرّك الجبهة). */
async function addHifzSession(
  studentId: string,
  circleId: string,
  surah: number,
  ayah: number,
  date: Date,
) {
  await prisma.dailySession.create({
    data: { studentId, circleId, date, hifzToSurah: surah, hifzToAyah: ayah },
  });
}

describe("estimateKhatmDate", () => {
  it("يرجع NO_TRACK إن لم يُسنَد مسار للطالب", async () => {
    const program = await createProgram(prisma);
    await scaffoldTracks(program.id);
    const { student } = await scaffoldStudent(program.id);

    const result = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result.kind).toBe("NO_TRACK");
  });

  it("يرجع INSUFFICIENT_DATA إن كانت البيانات أقل من أسبوعين (بيانات جديدة)", async () => {
    const program = await createProgram(prisma);
    const { t1 } = await scaffoldTracks(program.id);
    const { student, circle, teacher } = await scaffoldStudent(program.id);
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: t1.id, reason: "PACE_TEST" } });
    // ٥ جلسات فقط (أقل من ١٠)
    await addAttendance(student.id, circle.id, teacher.id, 5, 5, BASE_DATE);

    const result = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result.kind).toBe("INSUFFICIENT_DATA");
  });

  it("يحسب التقدير بحضور ١٠٠٪ في المسار الأوّل", async () => {
    const program = await createProgram(prisma);
    const { t1 } = await scaffoldTracks(program.id);
    const { student, circle, teacher } = await scaffoldStudent(program.id);
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: t1.id, reason: "PACE_TEST" } });
    // ٢٠ جلسة حضور ١٠٠٪ خلال ٨ أسابيع
    await addAttendance(student.id, circle.id, teacher.id, 20, 20, BASE_DATE);

    const result = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result.kind).toBe("DATE");
    if (result.kind !== "DATE") return;
    expect(result.regularityPct).toBe(100);
    expect(result.remainingUnits).toBeGreaterThan(0);
    expect(result.date.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("يحسب التقدير بحضور ٥٠٪ — التاريخ المقدَّر أبعد", async () => {
    const program = await createProgram(prisma);
    const { t1 } = await scaffoldTracks(program.id);
    const { student, circle, teacher } = await scaffoldStudent(program.id);
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: t1.id, reason: "PACE_TEST" } });
    // ٢٠ جلسة، ١٠ حضور (٥٠٪)
    await addAttendance(student.id, circle.id, teacher.id, 20, 10, BASE_DATE);

    const result50 = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result50.kind).toBe("DATE");
    if (result50.kind !== "DATE") return;
    expect(result50.regularityPct).toBe(50);

    // طالب آخر بحضور ١٠٠٪ لمقارنة التواريخ
    const { student: s2, circle: c2, teacher: t2 } = await scaffoldStudent(program.id);
    await prisma.trackAssignment.create({ data: { studentId: s2.id, trackId: t1.id, reason: "PACE_TEST" } });
    await addAttendance(s2.id, c2.id, t2.id, 20, 20, BASE_DATE);

    const result100 = await estimateKhatmDate(s2.id, NOW, prisma);
    expect(result100.kind).toBe("DATE");
    if (result100.kind !== "DATE") return;

    // ٥٠٪ حضور → تاريخ أبعد
    expect(result50.date.getTime()).toBeGreaterThan(result100.date.getTime());
  });

  it("يرجع INSUFFICIENT_DATA إن كان الحضور صفرًا", async () => {
    const program = await createProgram(prisma);
    const { t1 } = await scaffoldTracks(program.id);
    const { student, circle, teacher } = await scaffoldStudent(program.id);
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: t1.id, reason: "PACE_TEST" } });
    // ٢٠ جلسة، لا حضور
    await addAttendance(student.id, circle.id, teacher.id, 20, 0, BASE_DATE);

    const result = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result.kind).toBe("INSUFFICIENT_DATA");
  });

  it("يحترم المسار المرفوع: وحدات المسار الحالي فقط بعد الجبهة + المسارات الأعلى كاملة", async () => {
    const program = await createProgram(prisma);
    const { t2, t3, t4, t5 } = await scaffoldTracks(program.id);
    const { student, circle, teacher } = await scaffoldStudent(program.id);
    // الطالب في المسار الثاني (مرفوع)
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: t2.id, reason: "PACE_TEST" } });
    // جبهته: أتمّ الوحدة الأولى من المسار ٢ (٧٧:١–٧٧:٥٠)
    await addHifzSession(student.id, circle.id, 77, 50, BASE_DATE);
    await addAttendance(student.id, circle.id, teacher.id, 20, 20, BASE_DATE);

    const result = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result.kind).toBe("DATE");
    if (result.kind !== "DATE") return;
    // يجب أن تُحسب وحدة المجادلة من المسار ٢ + كل وحدات المسارات ٣/٤/٥
    const unitsT3 = await prisma.trackUnit.count({ where: { trackId: t3.id } });
    const unitsT4 = await prisma.trackUnit.count({ where: { trackId: t4.id } });
    const unitsT5 = await prisma.trackUnit.count({ where: { trackId: t5.id } });
    // من المسار ٢: وحدة واحدة متبقّية (المجادلة)
    expect(result.remainingUnits).toBe(1 + unitsT3 + unitsT4 + unitsT5);
  });

  it("يرجع COMPLETE إن كانت الجبهة تبلغ نهاية آخر مسار", async () => {
    const program = await createProgram(prisma);
    const { t5 } = await scaffoldTracks(program.id);
    const { student, circle } = await scaffoldStudent(program.id);
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: t5.id, reason: "PACE_TEST" } });
    // بلغ البقرة:٢٨٦ (نهاية المسار الأخير)
    await addHifzSession(student.id, circle.id, 2, 286, BASE_DATE);

    const result = await estimateKhatmDate(student.id, NOW, prisma);
    expect(result.kind).toBe("COMPLETE");
  });

  it("كلّ مرحلة من السلّم تعطي تاريخ ختمةٍ أقرب من المرحلة الأدنى (بحضورٍ متساوٍ)", async () => {
    const program = await createProgram(prisma);
    const { t1, t2, t3, t4, t5 } = await scaffoldTracks(program.id);
    const tracks = [t1, t2, t3, t4, t5];
    const dates: number[] = [];

    for (const track of tracks) {
      const { student, circle, teacher } = await scaffoldStudent(program.id);
      await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });
      await addAttendance(student.id, circle.id, teacher.id, 20, 20, BASE_DATE);
      const result = await estimateKhatmDate(student.id, NOW, prisma);
      if (result.kind !== "DATE") throw new Error(`المسار ${track.ordinal} لم يُعطِ تاريخاً`);
      dates.push(result.date.getTime());
    }

    // كل مسار أعلى يمتلك وحدات بمعدّل أسرع → تاريخ أقرب (أقل أو مساوٍ)
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });
});
