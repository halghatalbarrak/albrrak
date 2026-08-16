import { ProgramKey, ProgressState, Role, StageExamStatus, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  aggregateExamRanks,
  examSessionDates,
  recordStageExam,
  sessionsForHizbCount,
  type HizbExamInput,
} from "../stage-exam";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const err = (pageNo: number) => ({ pageNo, errorType: "WORD" as const });

// ═══════════════ دوالُّ نقيّة ═══════════════

describe("جلسات الاختبار — عددها بعدد الأحزاب (الحكم ٧)", () => {
  it("≤٢٠ ← جلسة · ٢١–٤٠ ← جلستان · >٤٠ ← ثلاث", () => {
    expect(sessionsForHizbCount(1)).toBe(1);
    expect(sessionsForHizbCount(20)).toBe(1);
    expect(sessionsForHizbCount(21)).toBe(2);
    expect(sessionsForHizbCount(40)).toBe(2);
    expect(sessionsForHizbCount(41)).toBe(3);
    expect(sessionsForHizbCount(60)).toBe(3);
  });
});

describe("أيام الجلسات — متتالية بالتقويم شاملةً العطلة (استثناء الحكم ٣)", () => {
  it("ثلاث جلساتٍ من الخميس ١ يناير ٢٠٢٦ ← تضمّ الجمعة والسبت (لا تُخطّى)", () => {
    const dates = examSessionDates("2026-01-01", 3);
    expect(dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    // فروق يومٍ واحدٍ بالضبط (لا إسقاط لأيّ يوم).
    for (let i = 1; i < dates.length; i++) {
      expect((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000).toBe(1);
    }
    // وضمن المدى جمعةٌ (٥) وسبتٌ (٦) — معدودتان.
    const wd = dates.map((d) => new Date(d + "T00:00:00Z").getUTCDay());
    expect(wd).toContain(5);
    expect(wd).toContain(6);
  });
});

describe("تجميع مراتب الاختبار (الحكم ٧)", () => {
  it("رسوب حزبٍ = رسوب الكلّ", () => {
    expect(aggregateExamRanks(["EXCELLENT", "PASS", "FAIL"])).toEqual({ status: "FAILED", finalRank: "FAIL" });
  });
  it("المرتبة النهائية = الأدنى (تميّز + اجتياز ← اجتياز)", () => {
    expect(aggregateExamRanks(["EXCELLENT", "PASS"])).toEqual({ status: "PASSED", finalRank: "PASS" });
  });
  it("كلّها تميّز ← تميّز", () => {
    expect(aggregateExamRanks(["EXCELLENT", "EXCELLENT"])).toEqual({ status: "PASSED", finalRank: "EXCELLENT" });
  });
});

// ═══════════════ التسجيل (تكامل) ═══════════════

// حلقة مراقي بمعلّمها، وطالبٌ أتمّ ثلاثة أحزاب (٥٨/٥٩/٦٠)، ومُسمِّعٌ محايد.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "الأصلية الأولى" },
  });
  const mk = (ordinal: number, hizb: number, fs: number, fa: number, ts: number, ta: number) =>
    prisma.stage.create({
      data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal, nameAr: `ح${hizb}`, parentId: main.id, hizbNumber: hizb, fromSurah: fs, fromAyah: fa, toSurah: ts, toAyah: ta },
    });
  const h60 = await mk(1, 60, 87, 1, 114, 6);
  const h59 = await mk(2, 59, 78, 1, 86, 17);
  const h58 = await mk(3, 58, 72, 1, 77, 50);

  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  // أتمّ الأحزاب الثلاثة (COMPLETED).
  for (const s of [h60, h59, h58]) {
    await prisma.stageProgress.create({
      data: { studentId: student.id, stageId: s.id, state: ProgressState.COMPLETED, startedAt: new Date(), completedAt: new Date() },
    });
  }
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  return { program, main, h60, h59, h58, circle, teacher, student, reciter };
}

const clean = (h60: string, h59: string, h58: string): HizbExamInput[] => [
  { stageId: h60, errors: [] },
  { stageId: h59, errors: [] },
  { stageId: h58, errors: [] },
];

describe("تسجيل اختبار المرحلة (الحكم ٧)", () => {
  it("ثلاثة أحزاب ← جلسةٌ واحدة، ونجاحٌ بتميّز إن نظُفت", async () => {
    const { student, main, reciter, h60, h59, h58 } = await scaffold();
    const out = await recordStageExam(
      { studentId: student.id, mainStageId: main.id, examinerId: reciter.id, startedOn: "2026-03-01", hizbs: clean(h60.id, h59.id, h58.id) },
      prisma,
    );
    expect(out.hizbCount).toBe(3);
    expect(out.plannedSessions).toBe(1);
    expect(out.sessionDates).toEqual(["2026-03-01"]);
    expect(out.status).toBe("PASSED");
    expect(out.finalRank).toBe("EXCELLENT");
    const row = await prisma.stageExam.findUniqueOrThrow({ where: { id: out.examId } });
    expect(row.status).toBe(StageExamStatus.PASSED);
  });

  it("رسوب حزبٍ واحد ← رسوب الاختبار كلّه", async () => {
    const { student, main, reciter, h60, h59, h58 } = await scaffold();
    const hizbs: HizbExamInput[] = [
      { stageId: h60.id, errors: [] }, // تميّز
      { stageId: h59.id, errors: Array.from({ length: 6 }, (_, i) => err(i + 1)) }, // رسوب
      { stageId: h58.id, errors: [] },
    ];
    const out = await recordStageExam(
      { studentId: student.id, mainStageId: main.id, examinerId: reciter.id, startedOn: "2026-03-01", hizbs },
      prisma,
    );
    expect(out.status).toBe("FAILED");
    expect(out.finalRank).toBe("FAIL");
  });

  it("المرتبة النهائية = أدنى مرتبة (اجتياز يخفض التميّز)", async () => {
    const { student, main, reciter, h60, h59, h58 } = await scaffold();
    const hizbs: HizbExamInput[] = [
      { stageId: h60.id, errors: [err(1)] }, // تميّز
      { stageId: h59.id, errors: Array.from({ length: 5 }, (_, i) => err(i + 1)) }, // اجتياز
      { stageId: h58.id, errors: [] }, // تميّز
    ];
    const out = await recordStageExam(
      { studentId: student.id, mainStageId: main.id, examinerId: reciter.id, startedOn: "2026-03-01", hizbs },
      prisma,
    );
    expect(out.status).toBe("PASSED");
    expect(out.finalRank).toBe("PASS");
  });

  it("مُختبِرٌ غير محايد (معلّم الطالب) ← يُرفض (الحكم ٦)", async () => {
    const { student, main, teacher, h60, h59, h58 } = await scaffold();
    await expect(
      recordStageExam(
        { studentId: student.id, mainStageId: main.id, examinerId: teacher.id, startedOn: "2026-03-01", hizbs: clean(h60.id, h59.id, h58.id) },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("نطاقٌ ناقص (لا يشمل كامل المحفوظ) ← يُرفض", async () => {
    const { student, main, reciter, h60, h59 } = await scaffold();
    await expect(
      recordStageExam(
        { studentId: student.id, mainStageId: main.id, examinerId: reciter.id, startedOn: "2026-03-01",
          hizbs: [{ stageId: h60.id, errors: [] }, { stageId: h59.id, errors: [] }] }, // ينقص ح٥٨
        prisma,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
