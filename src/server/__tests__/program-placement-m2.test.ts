import { ProgramHistoryReason, ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { todayTarget } from "../today-target";
import { placeQaidahLessons, placeMaraqi, changeStudentProgram } from "../placement-actions";
import { scheduleTransition, applyDueTransition, resolveStudentProgram, nextDay } from "../program-placement";
import { recordQaidahSession } from "../qaidah-session";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ═══ ق٣: تسكين مراقي — مثال أحمد (الجبهة بعد الحشر، المراجعة تشمل البقرة، الحفظ يتخطّاها) ═══
describe("todayTarget يدمج التسكين (ق٣)", () => {
  it("أحمد: بلغ الحشر بالترتيب + البقرة خارج الترتيب", async () => {
    const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
    const circle = await createCircle(prisma, maraqi.id);
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: maraqi.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });

    // مسارٌ بوحداتٍ بترتيب مراقي: الناس(114) ← الحشر(59) ← المجادلة(58) ← البقرة(2، الأخيرة).
    const track = await prisma.track.create({ data: { programId: maraqi.id, nameAr: "ص", linesPerDay: 15, ordinal: 4 } });
    await prisma.trackUnit.createMany({ data: [
      { trackId: track.id, unitNo: 1, startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6 },
      { trackId: track.id, unitNo: 2, startSurah: 59, startAyah: 1, endSurah: 59, endAyah: 24 },
      { trackId: track.id, unitNo: 3, startSurah: 58, startAyah: 1, endSurah: 58, endAyah: 22 },
      { trackId: track.id, unitNo: 4, startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 74 },
    ] });
    await prisma.trackAssignment.create({ data: { studentId: student.id, trackId: track.id, reason: "PACE_TEST" } });

    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    // التسكين: وصل إلى الحشر (59:24)، والبقرة (2) محفوظةٌ خارج الترتيب.
    await placeMaraqi({ actorId: mgr.id, studentId: student.id, reachedSurah: 59, reachedAyah: 24,
      outOfOrder: [{ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 74 }] }, prisma);

    // أحدٌ (٢٠٢٦-٠٥-١٠) — sliceIndex=0 فتظهر حصّة اليوم.
    const t = await todayTarget(student.id, "2026-05-10", prisma);
    expect(t.status).toBe("ACTIVE");
    // الحفظ الجديد بعد الحشر = المجادلة(58)، لا البقرة (تُخطّى لأنها محفوظة).
    expect(t.newHifz).toEqual({ kind: "NEW", bound: { fromSurah: 58, fromAyah: 1, toSurah: 58, toAyah: 22 } });
    // المراجعة تشمل البقرة (خارج الترتيب ⟵ راسخٌ فورًا)، وهي الوحيدة في المخزون.
    expect(t.murajaah?.totalStock).toBe(1);
    expect(t.murajaah?.todaySlice).toEqual([{ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 74 }]);
  });
});

// ═══ ق٢: تسكين القاعدة — دروسٌ قبل الحاليّ COMPLETED/PLACEMENT بلا نقاط ═══
describe("تسكين القاعدة (ق٢)", () => {
  async function qaidahScaffold() {
    const q = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const ch = await prisma.stage.create({ data: { programId: q.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "ب" } });
    const lessons = [];
    for (let i = 1; i <= 4; i++) lessons.push(await prisma.stage.create({ data: { programId: q.id, kind: StageKind.LESSON, ordinal: i, nameAr: `د${i}`, parentId: ch.id } }));
    const circle = await createCircle(prisma, q.id);
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: q.id } });
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    return { q, lessons, circle, student, mgr };
  }

  it("يُكمل ما قبل الدرس الحاليّ بمصدر PLACEMENT، بلا حركاتِ نقاط", async () => {
    const { lessons, student, mgr } = await qaidahScaffold();
    const res = await placeQaidahLessons({ actorId: mgr.id, studentId: student.id, currentLessonId: lessons[2].id }, prisma);
    expect(res.placedBefore).toBe(2);
    const done = await prisma.stageProgress.findMany({ where: { studentId: student.id, state: "COMPLETED" } });
    expect(done).toHaveLength(2);
    expect(done.every((d) => d.source === "PLACEMENT")).toBe(true);
    expect(await prisma.pointTransaction.count({ where: { studentId: student.id } })).toBe(0); // بلا نقاط
  });

  it("ق٧: غير المشرف/المدير يُرفض", async () => {
    const { lessons, student } = await qaidahScaffold();
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(placeQaidahLessons({ actorId: teacher.id, studentId: student.id, currentLessonId: lessons[1].id }, prisma))
      .rejects.toThrow();
  });
});

// ═══ ق٥ + الضوابط: الانتقال الكسول المؤرَّخ ═══
describe("الانتقال الكسول المؤرَّخ (ق٥، الضوابط ١/٣/٤)", () => {
  async function graduatedQaidah() {
    const q = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
    const track = await prisma.track.create({ data: { programId: maraqi.id, nameAr: "٣ أسطر", linesPerDay: 3, ordinal: 1 } });
    // برنامج القاعدة يشير إلى مراقي + مسارٌ افتراضيّ.
    await prisma.program.update({ where: { id: q.id }, data: { nextProgramId: maraqi.id, defaultTrackForIncomingId: track.id } });
    const circle = await createCircle(prisma, q.id);
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: q.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_QAIDAH } });
    return { q, maraqi, track, circle, student };
  }

  it("جدولةٌ لليوم التالي، لا تُطبَّق اليوم (حدّ منتصف الليل) وتُطبَّق غدًا بالمسار الافتراضيّ", async () => {
    const { maraqi, track, student } = await graduatedQaidah();
    const today = new Date("2026-05-10");
    await scheduleTransition(prisma, { studentId: student.id, nextProgramId: maraqi.id, trackId: track.id, from: nextDay(today) });

    // اليوم: لا انتقال — يبقى قاعدة، والمعلّق ظاهرٌ للعرض.
    const vToday = await resolveStudentProgram(prisma, student.id, iso(today));
    expect(vToday.programKey).toBe(ProgramKey.QAIDAH_MADANIYYAH);
    expect(vToday.pending?.programKey).toBe(ProgramKey.MARAQI);

    // الغد: يُطبَّق — قيد مراقي + المسار الافتراضيّ + IN_MARAQI + سطر GRADUATION، بلا معلّق.
    const vNext = await resolveStudentProgram(prisma, student.id, iso(nextDay(today)));
    expect(vNext.programKey).toBe(ProgramKey.MARAQI);
    expect(vNext.pending).toBeNull();
    const st = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(st.state).toBe(StudentState.IN_MARAQI);
    expect(await prisma.trackAssignment.count({ where: { studentId: student.id, trackId: track.id, endedAt: null } })).toBe(1);
    expect(await prisma.programEnrollmentHistory.count({ where: { studentId: student.id, reason: ProgramHistoryReason.GRADUATION } })).toBe(1);
  });

  it("الضابط ١: قراءتان متوازيتان ⟵ انتقالٌ واحد، قيدٌ واحد، سطرُ تاريخٍ واحد", async () => {
    const { maraqi, track, student } = await graduatedQaidah();
    const from = nextDay(new Date("2026-05-10"));
    await scheduleTransition(prisma, { studentId: student.id, nextProgramId: maraqi.id, trackId: track.id, from });
    const day = iso(from);
    await Promise.all([
      applyDueTransition(prisma, student.id, day),
      applyDueTransition(prisma, student.id, day),
    ]);
    // قيدٌ مراقي نشطٌ واحد + سطرُ تخرّجٍ واحد (لا ازدواج).
    const maraqiEnr = await prisma.enrollment.findMany({ where: { studentId: student.id, programId: maraqi.id, endedAt: null } });
    expect(maraqiEnr).toHaveLength(1);
    expect(await prisma.programEnrollmentHistory.count({ where: { studentId: student.id, reason: ProgramHistoryReason.GRADUATION } })).toBe(1);
  });

  it("الضابط ٤: تغيير المشرف البرنامج قبل التطبيق ⟵ يُلغى المعلّق", async () => {
    const { q, maraqi, track, student } = await graduatedQaidah();
    await scheduleTransition(prisma, { studentId: student.id, nextProgramId: maraqi.id, trackId: track.id, from: nextDay(new Date("2026-05-10")) });
    const mgr = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    // المشرف يغيّره يدويًّا (يُبقيه قاعدة) قبل الغد.
    await changeStudentProgram({ actorId: mgr.id, studentId: student.id, programId: q.id }, prisma);
    const st = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(st.pendingProgramId).toBeNull(); // أُلغي المعلّق
    // الغد: لا يُطبَّق شيءٌ (لا انتقال) — يبقى قاعدة.
    const v = await resolveStudentProgram(prisma, student.id, iso(nextDay(new Date("2026-05-10"))));
    expect(v.programKey).toBe(ProgramKey.QAIDAH_MADANIYYAH);
  });
});

// ═══ ق٥: التخرّج يجدول (أو يُنبّه عند غياب الإعداد) — عبر recordQaidahSession ═══
describe("تخرّج القاعدة يجدول الانتقال أو يُنبّه (ق٥)", () => {
  async function scaffold(withConfig: boolean) {
    const q = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const ch = await prisma.stage.create({ data: { programId: q.id, kind: StageKind.CHAPTER, ordinal: 1, nameAr: "ب" } });
    const ln = await prisma.stage.create({ data: { programId: q.id, kind: StageKind.LESSON, ordinal: 1, nameAr: "د", parentId: ch.id } }); // درسٌ واحد = الأخير
    const circle = await createCircle(prisma, q.id);
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: q.id } });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_QAIDAH } });
    if (withConfig) {
      const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
      const track = await prisma.track.create({ data: { programId: maraqi.id, nameAr: "٣", linesPerDay: 3, ordinal: 1 } });
      await prisma.program.update({ where: { id: q.id }, data: { nextProgramId: maraqi.id, defaultTrackForIncomingId: track.id } });
    }
    void ln;
    return { student, teacher };
  }

  it("مضبوطٌ ⟵ يُجدَّل المعلّق (يبقى قاعدة اليوم)", async () => {
    const { student, teacher } = await scaffold(true);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-10" }, prisma);
    const st = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(st.pendingProgramId).not.toBeNull(); // جُدِّل
    expect(st.pendingFrom).not.toBeNull();
  });

  it("غير مضبوطٍ (لا nextProgram) ⟵ لا معلّق، وحدثُ تنبيهٍ للمشرف", async () => {
    const { student, teacher } = await scaffold(false);
    await recordQaidahSession({ studentId: student.id, actorId: teacher.id, mastered: true, date: "2026-05-10" }, prisma);
    const st = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(st.pendingProgramId).toBeNull(); // لا انتقال
    expect(await prisma.event.count({ where: { type: "PROGRAM_TRANSITION_UNCONFIGURED", subjectId: student.id } })).toBe(1);
  });
});
