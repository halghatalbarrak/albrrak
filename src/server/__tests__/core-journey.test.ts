/**
 * الرحلة الأساسية — طالبٌ مراقي من الانتساب إلى نهاية جلسة كاملة
 *
 * التسلسل:
 * حلقة ← معلم ← طالب ← انتساب ← مسار (يمثّل نتيجة اختبار القراءة)
 *   ← اللوحة الموحّدة ← حضور ← حفظ مُتقَن ← خطآن (ترميم تلقائيّ)
 *   ← إلغاء الترميم ← نقل إلى حلقة أخرى ← تعليق على الحضور
 */
import { AttendanceStatus, ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { markStudentAttendance } from "../attendance";
import { recordHifz, setUnitErrors } from "../daily-session";
import { transferStudent } from "../enrollment";
import { getUnifiedBoard } from "../unified-session";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const DATE = "2026-05-10";
const DATE2 = "2026-05-11";

async function coreScaffold() {
  const program = await prisma.program.upsert({
    where: { key: ProgramKey.MARAQI },
    update: {},
    create: { key: ProgramKey.MARAQI, nameAr: "مراقي" },
  });
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "م١" },
  });
  await prisma.stage.create({
    data: {
      programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "الأعلى–الناس",
      parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6,
    },
  });
  const circle1 = await createCircle(prisma, program.id);
  const circle2 = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.createMany({ data: [{ circleId: circle1.id, teacherId: teacher.id }, { circleId: circle2.id, teacherId: teacher.id }] });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle1.id, programId: program.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });

  // المسار (يمثّل نتيجة اختبار القراءة + تعيين المسار)
  const track = await prisma.track.create({
    data: { programId: program.id, nameAr: "صفحة ١٥", linesPerDay: 15, ordinal: 1 },
  });
  await prisma.trackUnit.createMany({
    data: [
      { trackId: track.id, unitNo: 1, startSurah: 87, startAyah: 1, endSurah: 87, endAyah: 7 },
      { trackId: track.id, unitNo: 2, startSurah: 88, startAyah: 1, endSurah: 88, endAyah: 7 },
    ],
  });
  await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });

  return { program, circle1, circle2, teacher, student };
}

describe("الرحلة الأساسية — رحلة طالب مراقي كاملة", () => {
  it("يمرّ بكل خطوات الجلسة اليومية الكاملة بلا خطأ", async () => {
    const { circle1, circle2, teacher, student } = await coreScaffold();

    // ١. اللوحة الموحّدة — تعرض NEW hifz bound قبل أيّ تسجيل
    const boardBefore = await getUnifiedBoard(teacher.id, circle1.id, DATE, prisma);
    const rowBefore = boardBefore.students.find((s) => s.studentId === student.id);
    expect(rowBefore).toBeDefined();
    expect(rowBefore?.attendanceStatus).toBeNull();
    expect(rowBefore?.today.newHifz?.kind).toBe("NEW");
    const hifzBound = rowBefore?.today.newHifz?.kind === "NEW" ? rowBefore.today.newHifz.bound : null;
    expect(hifzBound?.fromSurah).toBe(87);

    // ٢. تسجيل الحضور (حاضر)
    await markStudentAttendance({ circleId: circle1.id, studentId: student.id, status: AttendanceStatus.PRESENT, date: DATE, recorderId: teacher.id }, prisma);
    const boardAfterAtt = await getUnifiedBoard(teacher.id, circle1.id, DATE, prisma);
    expect(boardAfterAtt.students.find((s) => s.studentId === student.id)?.attendanceStatus).toBe(AttendanceStatus.PRESENT);

    // ٣. تسجيل الحفظ (مُتقَن)
    await recordHifz({ studentId: student.id, teacherId: teacher.id, date: DATE, fromSurah: 87, fromAyah: 1, toSurah: 87, toAyah: 7, attempts: 2, mastered: true }, prisma);
    const session = await prisma.dailySession.findUniqueOrThrow({ where: { studentId_date: { studentId: student.id, date: new Date(DATE) } } });
    expect(session.hifzMastered).toBe(true);
    expect(session.repairedAt).toBeNull();

    // ٤. خطأ أوّل (1) — لا ترميم بعد
    const r1 = await setUnitErrors({ actorId: teacher.id, studentId: student.id, sessionId: session.id, errorCount: 1, date: DATE }, prisma);
    expect(r1.reverted).toBe(false);
    expect(r1.undidRevert).toBe(false);
    const after1err = await prisma.dailySession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after1err.repairedAt).toBeNull();

    // ٥. خطأ ثانٍ (2) — الحكم ٥: الترميم التلقائيّ (يعود حفظاً جديداً)
    const r2 = await setUnitErrors({ actorId: teacher.id, studentId: student.id, sessionId: session.id, errorCount: 2, date: DATE }, prisma);
    expect(r2.reverted).toBe(true);
    const after2err = await prisma.dailySession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after2err.repairedAt).not.toBeNull();

    // ٦. إلغاء الترميم في اليوم نفسه (التصحيح) — يرجع الخطأ إلى ١
    const r3 = await setUnitErrors({ actorId: teacher.id, studentId: student.id, sessionId: session.id, errorCount: 1, date: DATE }, prisma);
    expect(r3.undidRevert).toBe(true);
    expect(r3.reverted).toBe(false);
    const afterUndo = await prisma.dailySession.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterUndo.repairedAt).toBeNull();

    // ٧. النقل إلى حلقة أخرى
    await transferStudent(teacher.id, student.id, circle2.id, prisma);
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { studentId: student.id, endedAt: null } });
    expect(enrollment.circleId).toBe(circle2.id);
    // سجل التدقيق يحوي عملية النقل
    const auditEntry = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Student", entityId: student.id, action: "TRANSFER" } });
    expect(auditEntry.action).toBe("TRANSFER");

    // ٨. تعليق: حضور بملاحظة في اليوم التالي (بالحلقة الجديدة)
    await markStudentAttendance({ circleId: circle2.id, studentId: student.id, status: AttendanceStatus.LATE, date: DATE2, recorderId: teacher.id }, prisma);
    await prisma.attendance.update({
      where: { studentId_date: { studentId: student.id, date: new Date(DATE2) } },
      data: { note: "جاء متأخّراً — أُعفي بقرار المعلم" },
    });
    const att2 = await prisma.attendance.findUniqueOrThrow({ where: { studentId_date: { studentId: student.id, date: new Date(DATE2) } } });
    expect(att2.status).toBe(AttendanceStatus.LATE);
    expect(att2.note).toBe("جاء متأخّراً — أُعفي بقرار المعلم");
  });
});
