import { ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  assignTrackFromLines,
  displayBoundary,
  getMaraqiLadder,
  recordPaceTest,
  type TrackLite,
} from "../maraqi";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// المسارات الثمانية (§٨٫٥) — أسطرٌ يوميّة. صفحة المدينة = ١٥ سطرًا.
const TRACKS: TrackLite[] = [
  { id: "t3", nameAr: "٣ أسطر", linesPerDay: 3, ordinal: 1 },
  { id: "t5", nameAr: "٥ أسطر", linesPerDay: 5, ordinal: 2 },
  { id: "thalf", nameAr: "نصف صفحة", linesPerDay: 7.5, ordinal: 3 },
  { id: "tpage", nameAr: "صفحة", linesPerDay: 15, ordinal: 4 },
  { id: "t2page", nameAr: "صفحتان", linesPerDay: 30, ordinal: 5 },
  { id: "t3page", nameAr: "٣ صفحات", linesPerDay: 45, ordinal: 6 },
  { id: "t4page", nameAr: "٤ صفحات", linesPerDay: 60, ordinal: 7 },
  { id: "t5page", nameAr: "٥ صفحات", linesPerDay: 75, ordinal: 8 },
];
const nameFor = (lines: number) => assignTrackFromLines(lines, TRACKS)?.nameAr ?? null;

describe("عرض حدّ الحزب — بترتيب الحفظ التنازليّ (عرضٌ فقط)", () => {
  it("يعكس الطرفين، ويترك ما لا حدّ فيه كما هو", () => {
    expect(displayBoundary("الأعلى 1 - الناس 6")).toBe("الناس 6 - الأعلى 1");
    expect(displayBoundary("البقرة 1 - البقرة 74")).toBe("البقرة 74 - البقرة 1");
    expect(displayBoundary("المرحلة الأصلية الأولى")).toBe("المرحلة الأصلية الأولى");
  });
});

describe("إسناد المسار (§٨٫٥) — أعلى مسارٍ أقلُّ ممّا حفظ", () => {
  it("أمثلة الوثيقة", () => {
    expect(nameFor(15)).toBe("نصف صفحة"); // صفحة ← نصف صفحة
    expect(nameFor(5)).toBe("٣ أسطر"); // ٥ أسطر ← ٣ أسطر
    expect(nameFor(7.5)).toBe("٥ أسطر"); // نصف صفحة ← ٥ أسطر
    expect(nameFor(30)).toBe("صفحة"); // صفحتان ← صفحة
    expect(nameFor(75)).toBe("٤ صفحات"); // ٥ صفحات ← ٤ صفحات
  });

  it("أقلّ من ٣ أسطر ← لا مسار (يُعاد اختباره)", () => {
    expect(assignTrackFromLines(2, TRACKS)).toBeNull();
    expect(assignTrackFromLines(0, TRACKS)).toBeNull();
  });

  it("فوق السقف ← ٥ صفحات (السقف الحالي)", () => {
    expect(nameFor(100)).toBe("٥ صفحات");
  });
});

// ينشئ برنامج مراقي بمساراته، وطالبًا منتسبًا لحلقةٍ لها معلّم، بانتظار اختبار المقطع.
async function maraqiScaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  for (const t of TRACKS) {
    await prisma.track.create({
      data: { programId: program.id, nameAr: t.nameAr, linesPerDay: t.linesPerDay, ordinal: t.ordinal },
    });
  }
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة مراقي", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({
    where: { id: student.id },
    data: { state: StudentState.AWAITING_PACE_TEST },
  });
  return { program, circle, teacher, student };
}

describe("اختبار المقطع (§٨٫٥) — المُختبِر ليس معلمه (قاعدة مطلقة)", () => {
  it("معلمُ الطالب يحاول اختباره ← يُرفض في الخادم", async () => {
    const { teacher, student } = await maraqiScaffold();
    await expect(
      recordPaceTest({ studentId: student.id, administeredBy: teacher.id, linesMemorized: 15 }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("مُختبِرٌ ليس معلمه ← يُسند المسار وينتقل IN_MARAQI", async () => {
    const { student } = await maraqiScaffold();
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });
    const res = await recordPaceTest(
      { studentId: student.id, administeredBy: examiner.id, linesMemorized: 15 },
      prisma,
    );
    expect(res.assignedTrack?.nameAr).toBe("نصف صفحة"); // صفحة ← نصف صفحة
    expect(res.state).toBe(StudentState.IN_MARAQI);
    const after = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(after.state).toBe(StudentState.IN_MARAQI);
    const assignment = await prisma.trackAssignment.findFirst({ where: { studentId: student.id } });
    expect(assignment?.reason).toBe("PACE_TEST");
  });

  it("أقلّ من ٣ أسطر ← لا مسار، والحالة PACE_RETEST_SCHEDULED", async () => {
    const { student } = await maraqiScaffold();
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });
    const res = await recordPaceTest(
      { studentId: student.id, administeredBy: examiner.id, linesMemorized: 2 },
      prisma,
    );
    expect(res.assignedTrack).toBeNull();
    expect(res.state).toBe(StudentState.PACE_RETEST_SCHEDULED);
    const pt = await prisma.paceTest.findFirstOrThrow({ where: { studentId: student.id } });
    expect(pt.assignedTrackId).toBeNull();
  });

  it("لا يُسجَّل إلا لطالبٍ بانتظار اختبار المقطع", async () => {
    const { student } = await maraqiScaffold();
    const examiner = await createUser(prisma, { roles: [Role.TEACHER] });
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    await expect(
      recordPaceTest({ studentId: student.id, administeredBy: examiner.id, linesMemorized: 15 }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("عرض المراحل (§٨٫٢) — الطالب لا يرى «حزب»", () => {
  async function seedOneSub() {
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    const main = await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "المرحلة الأصلية الأولى" },
    });
    await prisma.stage.create({
      data: {
        programId: program.id,
        kind: StageKind.SUB_STAGE,
        ordinal: 1,
        nameAr: "الأعلى 1 - الناس 6",
        parentId: main.id,
        hizbNumber: 60,
        fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6,
      },
    });
    await prisma.hizbBoundary.create({
      data: {
        hizb: 60, juz: 30, startSurahNum: 87, startSurah: "الأعلى", startAyah: 1,
        endSurahNum: 114, endSurah: "الناس", endAyah: 6,
      },
    });
  }

  it("الطالب: رقم الحزب محجوب (null)، والجزء ظاهر", async () => {
    await seedOneSub();
    const ladder = await getMaraqiLadder({ roles: [Role.STUDENT] }, prisma);
    expect(ladder.canSeeHizb).toBe(false);
    const sub = ladder.mainStages[0].subStages[0];
    expect(sub.hizb).toBeNull();
    expect(sub.juz).toBe(30); // الجزء ليس «حزبًا» — يُعرض للجميع
    expect(sub.label).not.toContain("حزب");
  });

  it("بطاقة الحزب: الحدّ معكوسٌ عرضًا (الناس ← الأعلى)، والقاعدة لم تتغيّر", async () => {
    await seedOneSub();
    const ladder = await getMaraqiLadder({ roles: [Role.CIRCLE_MANAGER] }, prisma);
    // العرض بترتيب الحفظ التنازليّ.
    expect(ladder.mainStages[0].subStages[0].label).toBe("الناس 6 - الأعلى 1");
    // البيانات المرجعية لم تُمَسّ: nameAr المخزَّن بترتيب المصحف كما هو.
    const dbStage = await prisma.stage.findFirstOrThrow({ where: { hizbNumber: 60 } });
    expect(dbStage.nameAr).toBe("الأعلى 1 - الناس 6");
    const hb = await prisma.hizbBoundary.findUniqueOrThrow({ where: { hizb: 60 } });
    expect([hb.startSurah, hb.endSurah]).toEqual(["الأعلى", "الناس"]);
    // ترتيب الأحزاب نفسها لم يتغيّر: ٦٠ أولًا (ordinal ١).
    expect(ladder.mainStages[0].subStages[0].ordinal).toBe(1);
  });

  it("الكادر: رقم الحزب وجزؤه ظاهران", async () => {
    await seedOneSub();
    const ladder = await getMaraqiLadder({ roles: [Role.CIRCLE_MANAGER] }, prisma);
    expect(ladder.canSeeHizb).toBe(true);
    const sub = ladder.mainStages[0].subStages[0];
    expect(sub.hizb).toBe(60);
    expect(sub.juz).toBe(30);
  });
});
