import { ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { assignMaraqiTrack, autoAssignMissingTracks, assignMissingTrackForStudent } from "../track-assignment";
import { placeMaraqi } from "../placement-actions";
import { recordPaceTest } from "../maraqi";
import { AuthorizationError } from "../errors";
import { todayTarget } from "../today-target";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";
import { MARAQI_SURAH_ORDER } from "@/lib/maraqi-order";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// حالةٌ تجريبيّة: برنامج مراقي بخمسة مسارات (أسطر يوميّة: ٣/٦/٩/١٢/١٥) ومديرٌ ومعلّمٌ وطالب.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const tracks = [];
  for (let i = 1; i <= 5; i++) {
    const t = await prisma.track.create({
      data: {
        programId: program.id, nameAr: `مسار-${i}`, ordinal: i,
        linesPerDay: i * 3, isActive: true, tarseekhUnits: 10, reviewDaysPerWeek: 5,
      },
    });
    tracks.push(t);
  }
  const manager = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  const outsider = await createUser(prisma, { roles: [Role.TEACHER] });
  const circle = await createCircle(prisma, program.id);
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { program, tracks, manager, teacher, outsider, circle, student };
}

describe("assignMaraqiTrack — التعيين اليدويّ", () => {
  it("المدير يعيَّن مساراً لطالب في مراقي", async () => {
    const { tracks, manager, student } = await scaffold();
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[2].id, source: "MANUAL", actorId: manager.id });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a).not.toBeNull();
    expect(a?.trackId).toBe(tracks[2].id);
    expect(a?.reason).toBe("MANUAL");
  });

  it("معلّم الحلقة يعيَّن مساراً مقترحاً (لا أدنى)", async () => {
    const { tracks, teacher, student } = await scaffold();
    // بلا جبهة → المقترح هو ordinal=1 → المعلّم يختار الأعلى (ordinal=3) ← مسموح
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[2].id, source: "MANUAL", actorId: teacher.id });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a?.trackId).toBe(tracks[2].id);
  });

  it("معلّم خارج الحلقة ← خطأ تفويض", async () => {
    const { tracks, outsider, student } = await scaffold();
    await expect(
      assignMaraqiTrack({ studentId: student.id, trackId: tracks[0].id, source: "MANUAL", actorId: outsider.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("مسارٌ أدنى من المقترح مع معلّم ← خطأ تحقّق (trackBelowSuggestedManagerOnly)", async () => {
    const { tracks, teacher, student } = await scaffold();
    // جبهة عند سورة ٢٩ ← المقترح ordinal=4
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 29, reachedAyah: 1 } });
    // المعلّم يحاول إسناد ordinal=2 (أبطأ من ordinal=4)
    await expect(
      assignMaraqiTrack({ studentId: student.id, trackId: tracks[1].id, source: "MANUAL", actorId: teacher.id }),
    ).rejects.toMatchObject({ key: "trackBelowSuggestedManagerOnly" });
  });

  it("مسارٌ أدنى من المقترح مع مدير + ملاحظة ← مسموح", async () => {
    const { tracks, manager, student } = await scaffold();
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 29, reachedAyah: 1 } });
    await assignMaraqiTrack({
      studentId: student.id, trackId: tracks[1].id, source: "MANUAL", actorId: manager.id,
      note: "الطالب يطلب سرعةً أبطأ",
    });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a?.trackId).toBe(tracks[1].id);
  });

  it("مسارٌ أدنى مع مدير وبلا ملاحظة ← خطأ تحقّق (trackBelowSuggestedNoteRequired)", async () => {
    const { tracks, manager, student } = await scaffold();
    await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 29, reachedAyah: 1 } });
    await expect(
      assignMaraqiTrack({ studentId: student.id, trackId: tracks[1].id, source: "MANUAL", actorId: manager.id }),
    ).rejects.toMatchObject({ key: "trackBelowSuggestedNoteRequired" });
  });

  it("طالب بحالة AWAITING_READING_TEST وتسكين مراقي نشط ← يُسمح بالتعيين", async () => {
    const { tracks, manager, student } = await scaffold();
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.AWAITING_READING_TEST } });
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[0].id, source: "MANUAL", actorId: manager.id });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a).not.toBeNull();
    expect(a?.trackId).toBe(tracks[0].id);
  });

  it("طالب بلا تسكين مراقي نشط ← خطأ trackAssignmentMaraqiOnly", async () => {
    const { tracks, manager, student } = await scaffold();
    await prisma.enrollment.updateMany({ where: { studentId: student.id }, data: { endedAt: new Date() } });
    await expect(
      assignMaraqiTrack({ studentId: student.id, trackId: tracks[0].id, source: "MANUAL", actorId: manager.id }),
    ).rejects.toMatchObject({ key: "trackAssignmentMaraqiOnly" });
  });

  it("تعيين جديد يُغلق القديم ← سجلٌّ نشطٌ واحد فقط", async () => {
    const { tracks, manager, student } = await scaffold();
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[0].id, source: "MANUAL", actorId: manager.id });
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[1].id, source: "MANUAL", actorId: manager.id });
    const all = await prisma.trackAssignment.findMany({ where: { studentId: student.id } });
    expect(all).toHaveLength(2);
    expect(all.filter((a) => !a.endedAt)).toHaveLength(1);
    expect(all.find((a) => !a.endedAt)?.trackId).toBe(tracks[1].id);
  });
});

describe("التعيين التلقائيّ عند حفظ الجبهة (AUTO_FROM_FRONTIER)", () => {
  it("placeMaraqi ← تعيينٌ تلقائيّ عند سورة ٧٨ (ordinal=1)", async () => {
    const { manager, student } = await scaffold();
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: 78, reachedAyah: 1 });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a).not.toBeNull();
    expect(a?.reason).toBe("AUTO_FROM_FRONTIER");
    const t = await prisma.track.findUnique({ where: { id: a!.trackId } });
    expect(t?.ordinal).toBe(1);
  });

  it("placeMaraqi بلا جبهة («لا محفوظ سابق») ← تعيينٌ تلقائيّ ordinal=1", async () => {
    const { manager, student } = await scaffold();
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: null });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a).not.toBeNull();
    expect(a?.reason).toBe("AUTO_FROM_FRONTIER");
  });

  it("placeMaraqi عند سورة ٢٩ ← تعيينٌ تلقائيّ ordinal=4", async () => {
    const { manager, student } = await scaffold();
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: 29, reachedAyah: 1 });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a).not.toBeNull();
    const t = await prisma.track.findUnique({ where: { id: a!.trackId } });
    expect(t?.ordinal).toBe(4);
  });

  it("placeMaraqi والطالب لديه مسارٌ نشط ← لا تغيير في المسار", async () => {
    const { tracks, manager, student } = await scaffold();
    // عيَّن مساراً يدويّاً أوّلاً
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[2].id, source: "MANUAL", actorId: manager.id });
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: 78, reachedAyah: 1 });
    const all = await prisma.trackAssignment.findMany({ where: { studentId: student.id } });
    expect(all).toHaveLength(1); // لم يُنشأ تعيينٌ جديد
    expect(all[0].trackId).toBe(tracks[2].id);
  });
});

describe("التعيين الجماعيّ (BULK)", () => {
  it("المدير يُعيَّن مسارات لطالبَين في عمليّةٍ واحدة", async () => {
    const { program, tracks, manager, circle } = await scaffold();
    const { student: s2 } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: s2.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: s2.id }, data: { state: StudentState.IN_MARAQI } });
    const { student: s3 } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: s3.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: s3.id }, data: { state: StudentState.IN_MARAQI } });

    for (const s of [s2, s3]) {
      await assignMaraqiTrack({ studentId: s.id, trackId: tracks[0].id, source: "BULK", actorId: manager.id });
    }
    const a2 = await prisma.trackAssignment.findFirst({ where: { studentId: s2.id, endedAt: null } });
    const a3 = await prisma.trackAssignment.findFirst({ where: { studentId: s3.id, endedAt: null } });
    expect(a2?.reason).toBe("BULK");
    expect(a3?.reason).toBe("BULK");
  });
});

describe("حالة أويس — جبهة المطففين:٣٦ (سورة ٨٣ آية ٣٦، الجزء ٣٠ جارٍ)", () => {
  // يبذر وحدات المسار الأوّل بترتيب مراقي حتى السورة المطلوبة (وحدة/سورة للتبسيط).
  async function seedUnits(trackId: string, upToOrderIdx: number) {
    for (let i = 0; i <= upToOrderIdx; i++) {
      const surah = MARAQI_SURAH_ORDER[i];
      await prisma.trackUnit.create({
        data: { trackId, unitNo: i + 1, startSurah: surah, startAyah: 1, endSurah: surah, endAyah: 1 },
      });
    }
  }

  it("تسكين المطففين:٣٦ → مسار ordinal=1 (٣ أسطر/يوم) AUTO_FROM_FRONTIER", async () => {
    const { manager, student } = await scaffold();
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: 83, reachedAyah: 36 });
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a).not.toBeNull();
    expect(a?.reason).toBe("AUTO_FROM_FRONTIER");
    const t = await prisma.track.findUnique({ where: { id: a!.trackId } });
    expect(t?.ordinal).toBe(1);
    expect(t?.linesPerDay).toBe(3);
  });

  it("todayTarget بعد تسكين المطففين:٣٦ → newHifz ليس NO_TRACK + مراجعة غير فارغة", async () => {
    const { tracks, manager, student } = await scaffold();
    // بذر ٣٣ وحدة (الفاتحة + الناس حتى المطففين بترتيب مراقي)
    // MARAQI_SURAH_ORDER[32] = 83 (المطففين)
    await seedUnits(tracks[0].id, 34); // وحدات 0..34 → ٣٥ وحدة، بما فيها المطففين
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: 83, reachedAyah: 36 });
    const target = await todayTarget(student.id, new Date(), prisma);
    expect(target.status).toBe("ACTIVE");
    expect(target.newHifz?.kind).not.toBe("NO_TRACK");
    // المحفوظ حتى المطففين = 33+ وحدة، أكثر من tarseekhUnits=10 → مراجعة غير فارغة
    expect(target.murajaah?.totalStock).toBeGreaterThan(0);
    // الحفظ الجديد يبدأ بعد المطففين
    if (target.newHifz?.kind === "NEW") {
      const { bound } = target.newHifz;
      // وحدة ما بعد المطففين (index 33+) في ترتيب مراقي
      expect(bound.fromSurah).toBe(MARAQI_SURAH_ORDER[35] ?? bound.fromSurah);
    }
  });

  it("todayTarget بلا تسكين → NO_TRACK (الوضع السابق للإصلاح)", async () => {
    const { student } = await scaffold();
    const target = await todayTarget(student.id, new Date(), prisma);
    expect(target.newHifz?.kind).toBe("NO_TRACK");
    expect(target.murajaah?.totalStock ?? 0).toBe(0);
  });

  it("todayTarget بأجزاء كاملة (جزء ٣٠ كاملاً) → مراجعة غير فارغة", async () => {
    const { tracks, manager, student } = await scaffold();
    // جزء ٣٠: سورة ٧٨-١١٤ → السورة الأخيرة ١١٤، لكن في مراقي: الفاتحة ثمّ من ١١٤ نزولاً
    // جبهة «كلّ سور الجزء ٣٠»: آخرها المطففين:٣٦ (أعلى ترتيباً في مراقي)
    await seedUnits(tracks[0].id, 34);
    await placeMaraqi({ actorId: manager.id, studentId: student.id, reachedSurah: 83, reachedAyah: 36 });
    const target = await todayTarget(student.id, new Date(), prisma);
    expect(target.murajaah?.totalStock).toBeGreaterThan(0);
  });

  it("autoAssignMissingTracks يعيَّن المسار لطلاب بلا مسار ويتجاهل من لديه مسار", async () => {
    const { program, tracks, manager, student, circle } = await scaffold();
    // طالبٌ ثانٍ بلا مسار
    const { student: s2 } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: s2.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: s2.id }, data: { state: StudentState.IN_MARAQI } });
    // طالبٌ ثالثٌ لديه مسار
    await assignMaraqiTrack({ studentId: student.id, trackId: tracks[1].id, source: "MANUAL", actorId: manager.id });
    // يُعيَّن التلقائيّ
    const result = await autoAssignMissingTracks(circle.id, manager.id, prisma);
    expect(result.assigned).toBe(1); // s2 فقط
    expect(result.failed).toBe(0);
    // s2 الآن له مسار
    const a2 = await prisma.trackAssignment.findFirst({ where: { studentId: s2.id, endedAt: null } });
    expect(a2).not.toBeNull();
    expect(a2?.reason).toBe("AUTO_FROM_FRONTIER");
    // student لم يتغيّر مساره
    const a1 = await prisma.trackAssignment.findFirst({ where: { studentId: student.id, endedAt: null } });
    expect(a1?.trackId).toBe(tracks[1].id);
  });

  it("assignMissingTrackForStudent يعيَّن من التسكين؛ إن كان للطالب مسار يُعيد assigned=false", async () => {
    const { manager, student } = await scaffold();
    // بلا مسار أوّلاً
    const r1 = await assignMissingTrackForStudent(student.id, manager.id, prisma);
    expect(r1.assigned).toBe(true);
    // مرّةٌ ثانية (له مسار الآن)
    const r2 = await assignMissingTrackForStudent(student.id, manager.id, prisma);
    expect(r2.assigned).toBe(false);
  });
});

describe("اختبار المقطع (PACE_TEST) — لا تغيير في المسار القديم", () => {
  it("recordPaceTest يعيَّن المسار بمصدر PACE_TEST", async () => {
    const { program, tracks, circle } = await scaffold();
    // طالبٌ جديد بانتظار اختبار المقطع
    const { student: s } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: s.id, circleId: circle.id, programId: program.id } });
    await prisma.student.update({ where: { id: s.id }, data: { state: StudentState.AWAITING_PACE_TEST } });
    // مختبِرٌ من خارج الحلقة (م١)
    const examiner = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    // ضبط أسطر يوميّة المسار لتُصدِر مساراً صالحاً (أسطر=٥ → أعلى مسار أقلّ من ٥ هو مسار-١ بـ٣ أسطر)
    await prisma.track.update({ where: { id: tracks[0].id }, data: { linesPerDay: 3 } });
    await recordPaceTest({ studentId: s.id, administeredBy: examiner.id, linesMemorized: 5 }, prisma);
    const a = await prisma.trackAssignment.findFirst({ where: { studentId: s.id, endedAt: null } });
    expect(a).not.toBeNull();
    expect(a?.reason).toBe("PACE_TEST");
  });
});
