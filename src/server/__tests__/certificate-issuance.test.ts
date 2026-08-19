import {
  CertificateTemplate,
  ProgramKey,
  ProgressState,
  Role,
  StageKind,
  StudentState,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { completeChapter } from "../civil-base";
import { recordStageExam, type HizbExamInput } from "../stage-exam";
import { decideStageTransition } from "../stage-transition";
import { createProgram, createStudent, createUser } from "../testing/factories";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══════════════ MAIN_STAGE — شهادة إتمام المرحلة الأصلية (الحكم ٧) ═══════════════

// طالبٌ أتمّ ثلاثة أحزاب، ومُسمِّعٌ محايد، ومدير — كنمط اختبار انتقال المرحلة.
async function scaffoldStage() {
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
  for (const s of [h60, h59, h58]) {
    await prisma.stageProgress.create({
      data: { studentId: student.id, stageId: s.id, state: ProgressState.COMPLETED, startedAt: new Date(), completedAt: new Date() },
    });
  }
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, main, h60, h59, h58, student, reciter, manager };
}

const allClean = (a: string, b: string, c: string): HizbExamInput[] => [
  { stageId: a, errors: [] }, { stageId: b, errors: [] }, { stageId: c, errors: [] },
];

async function passExam(s: Awaited<ReturnType<typeof scaffoldStage>>, on = "2026-03-01") {
  return recordStageExam(
    { studentId: s.student.id, mainStageId: s.main.id, examinerId: s.reciter.id, startedOn: on, hizbs: allClean(s.h60.id, s.h59.id, s.h58.id) },
    prisma,
  );
}

describe("شهادة المرحلة الأصلية (MAIN_STAGE) — تُصدَر باعتماد المدير", () => {
  it("الاعتماد ⟵ شهادة MAIN_STAGE واحدة، بـ stageId والتميّز من finalRank", async () => {
    const s = await scaffoldStage();
    const out = await passExam(s);
    await decideStageTransition(
      { approvalId: out.approvalId!, decidedBy: s.manager.id, decision: "APPROVED" },
      prisma,
    );

    const certs = await prisma.certificate.findMany({ where: { studentId: s.student.id, template: CertificateTemplate.MAIN_STAGE } });
    expect(certs).toHaveLength(1);
    expect(certs[0].stageId).toBe(s.main.id);
    expect(certs[0].isExcellent).toBe(true); // تسميعٌ نظيف ⟵ EXCELLENT
    expect(certs[0].verifyToken.length).toBeGreaterThanOrEqual(16);
    expect(certs[0].revokedAt).toBeNull();
  });

  it("الرفض ⟵ لا شهادة", async () => {
    const s = await scaffoldStage();
    const out = await passExam(s);
    await decideStageTransition(
      { approvalId: out.approvalId!, decidedBy: s.manager.id, decision: "REJECTED", note: "يعيد الحزب الأخير" },
      prisma,
    );
    expect(await prisma.certificate.count({ where: { studentId: s.student.id } })).toBe(0);
  });

  it("لا تكرار: إعادة الاعتماد لمرحلةٍ لها شهادة ⟵ تبقى واحدة", async () => {
    const s = await scaffoldStage();
    const out = await passExam(s);
    await decideStageTransition({ approvalId: out.approvalId!, decidedBy: s.manager.id, decision: "APPROVED" }, prisma);

    // اقتراحٌ ثانٍ لنفس المرحلة (اختبارٌ لاحق) ⟵ اعتماد ثانٍ لا يُنشئ شهادةً جديدة.
    const out2 = await passExam(s, "2026-04-01");
    await decideStageTransition({ approvalId: out2.approvalId!, decidedBy: s.manager.id, decision: "APPROVED" }, prisma);

    expect(await prisma.certificate.count({ where: { studentId: s.student.id, template: CertificateTemplate.MAIN_STAGE, stageId: s.main.id } })).toBe(1);
  });
});

// ═══════════════ QAIDAH — شهادة القاعدة المدنية عند إتمام كلّ الأبواب ═══════════════

const CHAPTER_WEIGHTS = [8, 14, 8, 8, 10, 4, 4, 4, 4, 4, 8, 8, 3]; // الإجمالي ٨٧

async function seedChapters(programId: string) {
  const chapters = [];
  for (let i = 0; i < CHAPTER_WEIGHTS.length; i++) {
    chapters.push(
      await prisma.stage.create({
        data: { programId, kind: StageKind.CHAPTER, ordinal: i + 1, nameAr: `الباب ${i + 1}`, weight: CHAPTER_WEIGHTS[i] },
      }),
    );
  }
  return chapters;
}

describe("شهادة القاعدة المدنية (QAIDAH) — عند إتمام كلّ الأبواب", () => {
  it("إتمام كلّ الأبواب ⟵ شهادة QAIDAH واحدة", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const chapters = await seedChapters(program.id);
    const { student } = await createStudent(prisma);

    for (const ch of chapters) {
      await completeChapter({ studentId: student.id, chapterStageId: ch.id, actorId: student.userId }, prisma);
    }

    const certs = await prisma.certificate.findMany({ where: { studentId: student.id, template: CertificateTemplate.QAIDAH } });
    expect(certs).toHaveLength(1);
    expect(certs[0].verifyToken.length).toBeGreaterThanOrEqual(16);
    expect(certs[0].revokedAt).toBeNull();
  });

  it("قبل إتمام آخر باب ⟵ لا شهادة بعد", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const chapters = await seedChapters(program.id);
    const { student } = await createStudent(prisma);

    for (const ch of chapters.slice(0, -1)) {
      await completeChapter({ studentId: student.id, chapterStageId: ch.id, actorId: student.userId }, prisma);
    }
    expect(await prisma.certificate.count({ where: { studentId: student.id } })).toBe(0);
  });

  it("لا تكرار: إعادة إتمام بابٍ بعد الاكتمال ⟵ تبقى شهادةً واحدة", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const chapters = await seedChapters(program.id);
    const { student } = await createStudent(prisma);

    for (const ch of chapters) {
      await completeChapter({ studentId: student.id, chapterStageId: ch.id, actorId: student.userId }, prisma);
    }
    // إعادة وسمِ بابٍ مكتمل ⟵ لا شهادة ثانية.
    await completeChapter({ studentId: student.id, chapterStageId: chapters[0].id, actorId: student.userId }, prisma);

    expect(await prisma.certificate.count({ where: { studentId: student.id, template: CertificateTemplate.QAIDAH } })).toBe(1);
  });
});
