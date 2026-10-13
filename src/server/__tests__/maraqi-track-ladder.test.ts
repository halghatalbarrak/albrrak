import { ApprovalKind, ApprovalStatus, ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { raiseMaraqiTrack } from "../maraqi-track-ladder";
import { recordHifz, type HifzInput } from "../daily-session";
import { nextUnitForStudent } from "../track-units";
import { decideStageTransition } from "../stage-transition";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// خمسة مسارات مفعّلة بوحداتٍ تعطي نهايات السلّم (النبأ/المجادلة/الأحقاف/العنكبوت/الختم)،
// ومرحلتان بحدّي الأحقاف والعنكبوت (الحدّان المبوَّبان)، وحلقةُ مراقي بمعلّمها وطالبٍ IN_MARAQI.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main1 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "المرحلة ١", fromSurah: 1, fromAyah: 1, toSurah: 46, toAyah: 35 } });
  const main2 = await prisma.stage.create({ data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 2, nameAr: "المرحلة ٢", fromSurah: 45, fromAyah: 1, toSurah: 29, toAyah: 69 } });

  const mkTrack = async (ordinal: number, nameAr: string, lpd: number, units: number[][]) => {
    const t = await prisma.track.create({ data: { programId: program.id, nameAr, linesPerDay: lpd, ordinal, isActive: true } });
    let n = 1;
    for (const u of units) await prisma.trackUnit.create({ data: { trackId: t.id, unitNo: n++, startSurah: u[0], startAyah: u[1], endSurah: u[2], endAyah: u[3] } });
    return t;
  };
  const t1 = await mkTrack(1, "٣ أسطر", 3, [[114, 1, 78, 40]]);
  const t2 = await mkTrack(2, "٥ أسطر", 5, [[114, 1, 78, 40], [77, 1, 58, 22]]);
  const t3 = await mkTrack(3, "نصف صفحة", 7.5, [[114, 1, 46, 35]]);
  const t4 = await mkTrack(4, "صفحة", 15, [[114, 1, 29, 69]]);
  const t5 = await mkTrack(5, "صفحتان", 30, [[114, 1, 2, 286]]);

  const circle = await prisma.circle.create({ data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { program, main1, main2, t1, t2, t3, t4, t5, circle, teacher, manager, student };
}

const assignTrack = (studentId: string, trackId: string) =>
  prisma.trackAssignment.create({ data: { studentId, trackId, reason: "PACE_TEST" } });
const activeTrack = async (studentId: string) =>
  (await prisma.trackAssignment.findFirst({ where: { studentId, endedAt: null }, orderBy: { startedAt: "desc" }, select: { trackId: true } }))?.trackId;
const hifz = (studentId: string, teacherId: string, surah: number, fromAyah: number, toAyah: number) =>
  recordHifz({ studentId, teacherId, date: "2026-05-10", fromSurah: surah, fromAyah, toSurah: surah, toAyah, attempts: 1, mastered: true } as HifzInput, prisma);

describe("سلّم المسارات — الانتقال الآليّ (القرار ب)", () => {
  it("عند النبأ ثمّ المجادلة ينتقل آليًّا، والمسار الجديد يبدأ من الوحدة التالية بلا تكرار", async () => {
    const { t1, t2, t3, teacher, student } = await scaffold();
    await assignTrack(student.id, t1.id);
    await hifz(student.id, teacher.id, 78, 1, 40); // بلغ نهاية النبأ
    expect(await activeTrack(student.id)).toBe(t2.id);
    const next = await nextUnitForStudent(student.id, prisma); // الوحدة التالية = بعد النبأ (المرسلات ٧٧:١)
    expect([next?.startSurah, next?.startAyah]).toEqual([77, 1]);
    await hifz(student.id, teacher.id, 58, 1, 22); // بلغ نهاية المجادلة
    expect(await activeTrack(student.id)).toBe(t3.id);
    expect(await prisma.event.count({ where: { type: "MARAQI_TRACK_TRANSITION", subjectId: student.id } })).toBe(2);
  });
});

describe("سلّم المسارات — الحدّان المبوَّبان بعد اختبار المرحلة (القرار ب)", () => {
  it("عند الأحقاف لا ينتقل إلا بعد اعتماد اختبار المرحلة ١ (→ صفحة)", async () => {
    const { t3, t4, main1, teacher, manager, student } = await scaffold();
    await assignTrack(student.id, t3.id);
    await hifz(student.id, teacher.id, 46, 1, 35); // بلغ الأحقاف — حدٌّ مبوَّب
    expect(await activeTrack(student.id)).toBe(t3.id); // لم ينتقل: ينتظر الاختبار
    const appr = await prisma.approval.create({ data: { kind: ApprovalKind.STAGE_TRANSITION, status: ApprovalStatus.PENDING, subjectType: "StageExam", subjectId: "ex1", proposedBy: manager.id, payload: { studentId: student.id, mainStageId: main1.id } } });
    await decideStageTransition({ approvalId: appr.id, decidedBy: manager.id, decision: "APPROVED" }, prisma);
    expect(await activeTrack(student.id)).toBe(t4.id); // انتقل بعد الاعتماد
  });

  it("عند العنكبوت ينتقل إلى صفحتين بعد اعتماد اختبار المرحلة ٢", async () => {
    const { t4, t5, main2, teacher, manager, student } = await scaffold();
    await assignTrack(student.id, t4.id);
    await hifz(student.id, teacher.id, 29, 1, 69); // بلغ العنكبوت
    expect(await activeTrack(student.id)).toBe(t4.id);
    const appr = await prisma.approval.create({ data: { kind: ApprovalKind.STAGE_TRANSITION, status: ApprovalStatus.PENDING, subjectType: "StageExam", subjectId: "ex2", proposedBy: manager.id, payload: { studentId: student.id, mainStageId: main2.id } } });
    await decideStageTransition({ approvalId: appr.id, decidedBy: manager.id, decision: "APPROVED" }, prisma);
    expect(await activeTrack(student.id)).toBe(t5.id);
  });
});

describe("سلّم المسارات — الرفع اليدويّ (القرار ب)", () => {
  it("المدير يرفع ويُسجَّل الحدث، وغير المخوّل يُرفض، ولا يُخفَض آلياً بعد الرفع", async () => {
    const { t1, t4, teacher, manager, student } = await scaffold();
    await assignTrack(student.id, t1.id);
    await expect(
      raiseMaraqiTrack({ studentId: student.id, targetTrackId: t4.id, actorId: teacher.id, reason: "x" }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError); // المعلّم بلا صلاحية TRACK_PROMOTION
    await raiseMaraqiTrack({ studentId: student.id, targetTrackId: t4.id, actorId: manager.id, reason: "تمكّنٌ ظاهر" }, prisma);
    expect(await activeTrack(student.id)).toBe(t4.id);
    expect(await prisma.event.count({ where: { type: "MARAQI_TRACK_TRANSITION", subjectId: student.id } })).toBe(1);
    await hifz(student.id, teacher.id, 78, 1, 40); // بلوغ النبأ لا يخفض المرفوع يدويًّا
    expect(await activeTrack(student.id)).toBe(t4.id);
  });
});
