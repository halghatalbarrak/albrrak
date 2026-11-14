import { existsSync } from "node:fs";
import path from "node:path";
import { ProgramKey, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { setUnitErrors } from "../daily-session";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة مراقي: برنامج + مرحلة + حلقة ومعلّمها + طالب IN_MARAQI.
async function maraqiScaffold() {
  const program = await prisma.program.upsert({
    where: { key: ProgramKey.MARAQI },
    update: {},
    create: { key: ProgramKey.MARAQI, nameAr: "برنامج-مراقي" },
  });
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "المرحلة الأولى" },
  });
  await prisma.stage.create({
    data: {
      programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "الأعلى–الناس",
      parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6,
    },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة مراقي", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: program.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { circle, teacher, student };
}

// ينشئ جلسة حفظٍ مُتقَنة (نفس بنية daily-session.test.ts).
async function addMastered(studentId: string, circleId: string, day: number, fromSurah: number) {
  return prisma.dailySession.create({
    data: {
      studentId, circleId, date: new Date(Date.UTC(2026, 0, day)),
      hifzFromSurah: fromSurah, hifzFromAyah: 1, hifzToSurah: fromSurah, hifzToAyah: 5,
      hifzAttempts: 1, hifzMastered: true, hifzTeacherId: "t",
    },
  });
}

const TODAY = "2026-01-20";
const TODAY_DATE = new Date(Date.UTC(2026, 0, 20));

describe("setUnitErrors — ضبط الأخطاء (مطلق/idempotent)", () => {
  it("٣ ضغطات ثم الرابعة (العودة إلى صفر) ← الخادم ٠ أخطاء لليوم", async () => {
    const { circle, teacher, student } = await maraqiScaffold();
    for (let i = 1; i <= 11; i++) await addMastered(student.id, circle.id, i, i);
    const seg = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });

    const args = { studentId: student.id, sessionId: seg.id, date: TODAY, actorId: teacher.id };
    // ضغطة ١ (خطأ) → ضغطة ٢ (خطآن → ترميم) → ضغطة ٣ (ثلاثة، رُمِّمت اليوم) → ضغطة ٤ (سليمة)
    await setUnitErrors({ ...args, errorCount: 1 }, prisma);
    await setUnitErrors({ ...args, errorCount: 2 }, prisma);
    await setUnitErrors({ ...args, errorCount: 3 }, prisma);
    await setUnitErrors({ ...args, errorCount: 0 }, prisma);

    const count = await prisma.reviewError.count({ where: { sessionId: seg.id, date: TODAY_DATE } });
    expect(count).toBe(0);
  });

  it("ضغطتان ← ترميم (reverted=true)؛ ثم خطأٌ واحد في اليوم نفسه ← إلغاء الترميم (undidRevert=true)", async () => {
    const { circle, teacher, student } = await maraqiScaffold();
    for (let i = 1; i <= 11; i++) await addMastered(student.id, circle.id, i, i);
    const seg = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });

    const args = { studentId: student.id, sessionId: seg.id, date: TODAY, actorId: teacher.id };
    const r1 = await setUnitErrors({ ...args, errorCount: 2 }, prisma);
    expect(r1.reverted).toBe(true);
    expect(r1.undidRevert).toBe(false);
    const after1 = await prisma.dailySession.findUniqueOrThrow({ where: { id: seg.id } });
    expect(after1.repairedAt).not.toBeNull();

    // الرجوع إلى خطأٍ واحد في اليوم نفسه ← إلغاء الترميم
    const r2 = await setUnitErrors({ ...args, errorCount: 1 }, prisma);
    expect(r2.undidRevert).toBe(true);
    expect(r2.reverted).toBe(false);
    const after2 = await prisma.dailySession.findUniqueOrThrow({ where: { id: seg.id } });
    expect(after2.repairedAt).toBeNull();
  });

  it("إعادة التحميل تعرض القيمة المحفوظة (أخطاء اليوم تُخزَّن في الخادم)", async () => {
    const { circle, teacher, student } = await maraqiScaffold();
    for (let i = 1; i <= 11; i++) await addMastered(student.id, circle.id, i, i);
    const seg = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });

    await setUnitErrors(
      { studentId: student.id, sessionId: seg.id, date: TODAY, actorId: teacher.id, errorCount: 1 },
      prisma,
    );

    // استعلامٌ مستقل يحاكي إعادة التحميل
    const saved = await prisma.reviewError.count({ where: { sessionId: seg.id, date: TODAY_DATE } });
    expect(saved).toBe(1);
  });

  it("القيمة ٠ تحذف أخطاء اليوم فقط دون مساس الأيام السابقة", async () => {
    const { circle, teacher, student } = await maraqiScaffold();
    for (let i = 1; i <= 11; i++) await addMastered(student.id, circle.id, i, i);
    const seg = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });

    // خطأ في يومٍ سابق
    const prevDate = new Date(Date.UTC(2026, 0, 15));
    await prisma.reviewError.create({ data: { sessionId: seg.id, recordedBy: teacher.id, date: prevDate } });

    await setUnitErrors(
      { studentId: student.id, sessionId: seg.id, date: TODAY, actorId: teacher.id, errorCount: 0 },
      prisma,
    );

    const prevCount = await prisma.reviewError.count({ where: { sessionId: seg.id, date: prevDate } });
    expect(prevCount).toBe(1);
  });

  it("عدد أخطاء خارج المدى (٤) ← خطأ تحقّق", async () => {
    const { circle, teacher, student } = await maraqiScaffold();
    await addMastered(student.id, circle.id, 1, 1);
    const seg = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });
    await expect(
      setUnitErrors(
        { studentId: student.id, sessionId: seg.id, date: TODAY, actorId: teacher.id, errorCount: 4 },
        prisma,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("مسار خريطة الضعف — لا رابط ميت", () => {
  it("صفحة /admin/circles/[id]/weakness موجودة في المستودع", () => {
    const p = path.resolve(process.cwd(), "src/app/admin/circles/[id]/weakness/page.tsx");
    expect(existsSync(p)).toBe(true);
  });
});
