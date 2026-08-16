import { HasadResult, ProgramKey, ProgressState, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  declareHasadReadiness,
  listReadyForHasad,
  recordHasad,
  subStageHarvestRange,
  type HasadErrorInput,
} from "../hasad";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// خوارزمية التقدير النقيّة مُختبَرةٌ في hasad-grading.test.ts (الحكم ٧، المرحلة ٢).
const err = (pageNo: number): HasadErrorInput => ({ pageNo, errorType: "WORD" });

// سقّالة: مرحلتان أصليتان بأحزابهما، وحلقة مراقي بمعلّمها، وطالبٌ منتسب.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main1 = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية الأولى" },
  });
  const main2 = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 2, nameAr: "الأصلية الثانية" },
  });
  // مراقي تنازليّ: الأحزاب العليا في المرحلة الأولى (تنتهي بالناس)، والأدنى في الثانية.
  const h60 = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "ح٦٠", parentId: main1.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6 },
  });
  const h50 = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 11, nameAr: "ح٥٠", parentId: main2.id, hizbNumber: 50, fromSurah: 43, fromAyah: 24, toSurah: 45, toAyah: 37 },
  });
  const h49 = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 12, nameAr: "ح٤٩", parentId: main2.id, hizbNumber: 49, fromSurah: 41, fromAyah: 47, toSurah: 43, toAyah: 23 },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  return { program, main1, main2, h60, h50, h49, circle, teacher, student, reciter };
}

describe("نطاق حصاد الفرعية (§٨٫٧) — من أول المرحلة الأصلية لا من أول البرنامج", () => {
  it("حصاد حزبٍ في المرحلة الثانية لا يمتدّ إلى الأولى (الناس)", async () => {
    const { h49 } = await scaffold();
    const range = await subStageHarvestRange(h49.id, prisma);
    // من بداية الحزب ٤٩ (فصلت ٤٧) إلى نهاية أعلى حزبٍ في مرحلته (الحزب ٥٠: الجاثية ٣٧).
    expect([range.fromSurah, range.fromAyah]).toEqual([41, 47]);
    expect([range.toSurah, range.toAyah]).toEqual([45, 37]);
    // ليس الناس (١١٤) — لا يمتدّ إلى المرحلة الأولى/أول البرنامج.
    expect(range.toSurah).not.toBe(114);
  });
});

describe("إعلان الجاهزية (§٨٫٩) — المعلم وحده", () => {
  it("غير معلمه ← يُرفض؛ ومعلمه ← AWAITING_HASAD", async () => {
    const { student, teacher, h60 } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: stranger.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: teacher.id }, prisma);
    const p = await prisma.stageProgress.findUniqueOrThrow({
      where: { studentId_stageId: { studentId: student.id, stageId: h60.id } },
    });
    expect(p.state).toBe(ProgressState.AWAITING_HASAD);
    expect(p.readyDeclaredAt).not.toBeNull();
  });
});

describe("تسجيل الحصاد (§٨٫٧) — المُسمِّع ليس معلمه (قاعدة مطلقة)", () => {
  it("معلمُ الطالب يحاول الحصاد ← يُرفض في الخادم", async () => {
    const { student, teacher, h60 } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: teacher.id }, prisma);
    await expect(
      recordHasad({ studentId: student.id, stageId: h60.id, reciterId: teacher.id, errors: [] }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("بلا إعلان جاهزية ← يُرفض", async () => {
    const { student, reciter, h60 } = await scaffold();
    await expect(
      recordHasad({ studentId: student.id, stageId: h60.id, reciterId: reciter.id, errors: [] }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("مُسمِّعٌ ليس معلمه ← يُسجَّل، والمرتبة محسوبةٌ تراكميًّا (ستّة أخطاء ← رسوب)", async () => {
    const { student, teacher, reciter, h60 } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: teacher.id }, prisma);
    const out = await recordHasad(
      { studentId: student.id, stageId: h60.id, reciterId: reciter.id, errors: Array.from({ length: 6 }, (_, i) => err(i + 1)) },
      prisma,
    );
    expect(out.rank).toBe("FAIL");
    expect(out.totalErrors).toBe(6);
    expect(out.attemptNo).toBe(1);
    const hasad = await prisma.hasad.findUniqueOrThrow({ where: { id: out.hasadId }, include: { pageErrors: true } });
    expect(hasad.result).toBe(HasadResult.FAIL);
    expect(hasad.pageErrors).toHaveLength(6);
    // النطاق مشتقٌّ من المرحلة (لا يُدخِله المُسمِّع).
    expect([hasad.fromSurah, hasad.toSurah]).toEqual([87, 114]);
  });

  it("المراتب على الحدود: خطأ ← تميّز · خمسة ← اجتياز · ستّة ← رسوب", async () => {
    const { student, teacher, reciter, h60, h50, h49 } = await scaffold();
    const stages = [h60, h50, h49];
    const cases: { errs: number; rank: string }[] = [
      { errs: 1, rank: "EXCELLENT" }, { errs: 5, rank: "PASS" }, { errs: 6, rank: "FAIL" },
    ];
    for (let i = 0; i < cases.length; i++) {
      await declareHasadReadiness({ studentId: student.id, stageId: stages[i].id, teacherId: teacher.id }, prisma);
      const out = await recordHasad(
        { studentId: student.id, stageId: stages[i].id, reciterId: reciter.id, errors: Array.from({ length: cases[i].errs }, (_, j) => err(j + 1)) },
        prisma,
      );
      expect(out.rank).toBe(cases[i].rank);
    }
  });

  it("التردّد يُخزَّن ويُحسب (٣ في وجهٍ = خطأ)، ولا يُسجَّل مع الأخطاء", async () => {
    const { student, teacher, reciter, h60 } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: teacher.id }, prisma);
    const out = await recordHasad(
      { studentId: student.id, stageId: h60.id, reciterId: reciter.id, errors: [],
        hesitations: [{ faceNo: 590 }, { faceNo: 590 }, { faceNo: 590 }] },
      prisma,
    );
    expect(out.hesitationErrors).toBe(1);
    expect(out.totalErrors).toBe(1);
    expect(out.rank).toBe("EXCELLENT"); // خطأ واحد = تميّز
    // التردّد يُخزَّن في جدولٍ مستقلّ، لا في أخطاء الصفحة.
    expect(await prisma.hasadHesitation.count({ where: { hasadId: out.hasadId } })).toBe(3);
    const hasad = await prisma.hasad.findUniqueOrThrow({ where: { id: out.hasadId }, include: { pageErrors: true } });
    expect(hasad.pageErrors).toHaveLength(0);
  });

  it("الضربتان: رسوبٌ أوّل (لا انتقال) ← حصادٌ ثانٍ attemptNo ٢", async () => {
    const { student, teacher, reciter, h60 } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: teacher.id }, prisma);
    // رسوب (٦ أخطاء) لا ينقل ← تبقى الجاهزية، فيجوز حصادٌ ثانٍ.
    await recordHasad({ studentId: student.id, stageId: h60.id, reciterId: reciter.id, errors: Array.from({ length: 6 }, (_, i) => err(i + 1)) }, prisma);
    const second = await recordHasad(
      { studentId: student.id, stageId: h60.id, reciterId: reciter.id, errors: [] },
      prisma,
    );
    expect(second.attemptNo).toBe(2);
    expect(second.rank).toBe("EXCELLENT"); // صفر خطأ
  });
});

describe("قائمة الجاهزين للمُسمِّع", () => {
  it("تُرشِّح من يجوز له حصادهم (ليس معلمهم)", async () => {
    const { student, teacher, reciter, h60 } = await scaffold();
    await declareHasadReadiness({ studentId: student.id, stageId: h60.id, teacherId: teacher.id }, prisma);
    // المُسمِّع (ليس معلمه) يراه؛ المعلم لا (canExamine=false له).
    expect(await listReadyForHasad(reciter.id, prisma)).toHaveLength(1);
    expect(await listReadyForHasad(teacher.id, prisma)).toHaveLength(0);
  });
});
