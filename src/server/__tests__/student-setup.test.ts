import { ApprovalKind, ApprovalStatus, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getStudentSetupStatus, suggestTrackForStudent } from "../student-setup";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ─────────────────────────────────────────────────────────────
// الموانع (blockers)
// ─────────────────────────────────────────────────────────────

describe("getStudentSetupStatus — NO_PROGRAM", () => {
  it("يُرجع NO_PROGRAM إذا لم يكن للطالب انتساب نشط", async () => {
    const { student } = await createStudent(prisma);
    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.isComplete).toBe(false);
    expect(status.blockers).toHaveLength(1);
    expect(status.blockers[0].key).toBe("NO_PROGRAM");
  });

  it("يُرجع NO_PROGRAM إذا كان الانتساب بلا برنامج", async () => {
    const { student } = await createStudent(prisma);
    const circle = await createCircle(prisma, null);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.blockers[0].key).toBe("NO_PROGRAM");
  });
});

describe("getStudentSetupStatus — READING_TEST", () => {
  it("يُرجع READING_TEST بلا approvalId إذا لم يُقترَح بعد", async () => {
    const { student } = await createStudent(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.AWAITING_READING_TEST } });

    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.isComplete).toBe(false);
    expect(status.blockers[0].key).toBe("READING_TEST");
    expect((status.blockers[0] as { key: "READING_TEST"; pendingApprovalId: string | null }).pendingApprovalId).toBeNull();
  });

  it("يُرجع READING_TEST مع approvalId إذا كان الاقتراح معلَّقاً", async () => {
    const { student } = await createStudent(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.AWAITING_READING_TEST } });
    const examiner = await createUser(prisma, { roles: [Role.REGISTRAR] });
    const approval = await prisma.approval.create({
      data: {
        kind: ApprovalKind.PLACEMENT_DECISION,
        subjectType: "Student",
        subjectId: student.id,
        proposedBy: examiner.id,
        status: ApprovalStatus.PENDING,
        payload: { readsFluently: true, notes: "جيّد", circleId: null },
      },
    });

    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.blockers[0].key).toBe("READING_TEST");
    expect((status.blockers[0] as { key: "READING_TEST"; pendingApprovalId: string | null }).pendingApprovalId).toBe(approval.id);
  });
});

describe("getStudentSetupStatus — FRONTIER", () => {
  it("يُرجع FRONTIER إذا لم يُسكَّن الطالب المراقي", async () => {
    const { student } = await createStudent(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    // تسكين المسار لإزالة NO_TRACK (نركّز على FRONTIER فقط)
    const track = await prisma.track.create({ data: { programId: program.id, nameAr: "٣ أسطر", linesPerDay: 3, ordinal: 1 } });
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });

    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.blockers.some((b) => b.key === "FRONTIER")).toBe(true);
  });

  it("لا يُظهر FRONTIER إذا كان للطالب صفٌّ في MaraqiPlacement", async () => {
    const { student } = await createStudent(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    const track = await prisma.track.create({ data: { programId: program.id, nameAr: "٣ أسطر", linesPerDay: 3, ordinal: 1 } });
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });
    await prisma.maraqiPlacement.create({ data: { studentId: student.id } }); // صفٌّ موجود = إعداد مكتمل

    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.blockers.every((b) => b.key !== "FRONTIER")).toBe(true);
  });
});

describe("getStudentSetupStatus — NO_TRACK", () => {
  it("يُرجع NO_TRACK إذا لم يُسنَد مسار للطالب المراقي", async () => {
    const { student } = await createStudent(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    await prisma.maraqiPlacement.create({ data: { studentId: student.id } });

    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.blockers.some((b) => b.key === "NO_TRACK")).toBe(true);
  });

  it("لا يُظهر NO_TRACK إذا كان للطالب مسار نشط", async () => {
    const { student } = await createStudent(prisma);
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    await prisma.maraqiPlacement.create({ data: { studentId: student.id } });
    const track = await prisma.track.create({ data: { programId: program.id, nameAr: "٣ أسطر", linesPerDay: 3, ordinal: 1 } });
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });

    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.isComplete).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// التنبيهات (warnings)
// ─────────────────────────────────────────────────────────────

describe("getStudentSetupStatus — NO_GUARDIAN / NO_PHONE", () => {
  async function scaffoldComplete(birthDate: Date) {
    const { student, user } = await createStudent(prisma);
    await prisma.user.update({ where: { id: user.id }, data: { birthDate } });
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, program.id);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    await prisma.maraqiPlacement.create({ data: { studentId: student.id } });
    const track = await prisma.track.create({ data: { programId: program.id, nameAr: "مسار", linesPerDay: 3, ordinal: 1 } });
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });
    return { student, user };
  }

  it("يُرجع NO_GUARDIAN إذا كان الطالب دون ١٨ وبلا ولي", async () => {
    const birthDate = new Date("2015-01-01"); // ~١١ سنة
    const { student } = await scaffoldComplete(birthDate);
    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.isComplete).toBe(true); // blockers فارغة
    expect(status.warnings.some((w) => w.key === "NO_GUARDIAN")).toBe(true);
  });

  it("يُرجع NO_PHONE إذا كان عمر الطالب ١٣+ وبلا جوال", async () => {
    const birthDate = new Date("2010-01-01"); // ~١٦ سنة
    const { student } = await scaffoldComplete(birthDate);
    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.warnings.some((w) => w.key === "NO_PHONE")).toBe(true);
  });

  it("لا تنبيه NO_PHONE للطالب دون ١٣", async () => {
    const birthDate = new Date("2018-01-01"); // ~٨ سنوات
    const { student } = await scaffoldComplete(birthDate);
    const status = await getStudentSetupStatus(student.id, prisma);
    expect(status.warnings.every((w) => w.key !== "NO_PHONE")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// suggestTrackForStudent
// ─────────────────────────────────────────────────────────────

describe("suggestTrackForStudent", () => {
  async function scaffoldTracks() {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const t1 = await prisma.track.create({ data: { programId: program.id, nameAr: "٣ أسطر", linesPerDay: 3, ordinal: 1 } });
    const t2 = await prisma.track.create({ data: { programId: program.id, nameAr: "٥ أسطر", linesPerDay: 5, ordinal: 2 } });
    const t5 = await prisma.track.create({ data: { programId: program.id, nameAr: "صفحتان", linesPerDay: 30, ordinal: 5 } });
    return { program, t1, t2, t5 };
  }

  it("يقترح المسار الأبطأ (ordinal=1) إذا لم يكن للطالب محفوظ", async () => {
    const { t1 } = await scaffoldTracks();
    const { student } = await createStudent(prisma);
    const suggestion = await suggestTrackForStudent(student.id, prisma);
    expect(suggestion.suggestedTrackId).toBe(t1.id);
  });

  it("يقترح مسار ordinal=1 للطالب الذي اختار «لا محفوظ» (MaraqiPlacement بلا surah)", async () => {
    const { t1 } = await scaffoldTracks();
    const { student } = await createStudent(prisma);
    // «لا محفوظ» = صفٌّ في MaraqiPlacement بلا reachedSurah
    await prisma.maraqiPlacement.create({ data: { studentId: student.id } });
    const suggestion = await suggestTrackForStudent(student.id, prisma);
    expect(suggestion.suggestedTrackId).toBe(t1.id);
  });

  it("يقترح مسار ordinal=1 لطالب جبهته في سورة ≥ 78 (النبأ)", async () => {
    const { t1 } = await scaffoldTracks();
    const { student } = await createStudent(prisma);
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 90, reachedAyah: 1 } }); // الشمس ≥ 78
    const suggestion = await suggestTrackForStudent(student.id, prisma);
    expect(suggestion.suggestedTrackId).toBe(t1.id);
  });

  it("يقترح مسار ordinal=2 لطالب جبهته في سورة ≥ 58 وأقل من 78 (المجادلة)", async () => {
    const { t2 } = await scaffoldTracks();
    const { student } = await createStudent(prisma);
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 65, reachedAyah: 1 } }); // الطلاق
    const suggestion = await suggestTrackForStudent(student.id, prisma);
    expect(suggestion.suggestedTrackId).toBe(t2.id);
  });

  it("يقترح المسار الأعلى المفعَّل إذا لم يوجد مسار بالرتبة المطلوبة", async () => {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const t5 = await prisma.track.create({ data: { programId: program.id, nameAr: "صفحتان", linesPerDay: 30, ordinal: 5 } });
    const { student } = await createStudent(prisma);
    // جبهة في أسفل القرآن (سورة 10) → targetOrdinal=5
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 10, reachedAyah: 1 } });
    const suggestion = await suggestTrackForStudent(student.id, prisma);
    expect(suggestion.suggestedTrackId).toBe(t5.id);
  });
});
