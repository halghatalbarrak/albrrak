import { ProgramKey, ProgressState, Role, StageKind, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  getHifzGate,
  getSessionView,
  getStudentPosition,
  recordHifz,
  recordMurajaah,
  recordReviewError,
  recordTarseekh,
} from "../daily-session";
import { getConsolidation } from "../tarseekh";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة مراقي: برنامج + مرحلتان فرعيتان (حزب ٦٠ و٥٩ بحدودهما) + حلقة ومعلّمها +
// طالبٌ منتسبٌ IN_MARAQI.
async function maraqiScaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const main = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.MAIN_STAGE, ordinal: 1, nameAr: "المرحلة الأصلية الأولى" },
  });
  const h60 = await prisma.stage.create({
    data: {
      programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "الأعلى 1 - الناس 6",
      parentId: main.id, hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6,
    },
  });
  const h59 = await prisma.stage.create({
    data: {
      programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 2, nameAr: "النبأ 1 - الطارق 17",
      parentId: main.id, hizbNumber: 59, fromSurah: 78, fromAyah: 1, toSurah: 86, toAyah: 17,
    },
  });
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة مراقي", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { program, circle, teacher, student, h60, h59 };
}

const hifzArgs = (studentId: string, teacherId: string, over: Partial<{ fromSurah: number; toSurah: number }> = {}) => ({
  studentId, teacherId, date: "2026-05-10",
  fromSurah: over.fromSurah ?? 90, fromAyah: 1, toSurah: over.toSurah ?? 95, toAyah: 5,
  attempts: 2, mastered: true,
});

describe("الحفظ (§٨٫٣) — على المعلم وحده (قاعدة مطلقة)", () => {
  it("معلمٌ ليس معلمه يحاول تسجيل حفظه ← يُرفض في الخادم", async () => {
    const { student } = await maraqiScaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(recordHifz(hifzArgs(student.id, stranger.id), prisma)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("معلم الطالب يسجّل الحفظ ← يُحفظ ويُصدِر حدثًا", async () => {
    const { student, teacher } = await maraqiScaffold();
    await recordHifz(hifzArgs(student.id, teacher.id), prisma);
    const row = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.hifzAttempts).toBe(2);
    expect(row.hifzMastered).toBe(true);
    expect(row.hifzTeacherId).toBe(teacher.id);
    expect(await prisma.event.count({ where: { type: "HIFZ_RECORDED" } })).toBe(1);
  });

  it("نطاقٌ معكوس ← يُرفض؛ ومحاولات < ١ ← يُرفض", async () => {
    const { student, teacher } = await maraqiScaffold();
    await expect(
      recordHifz({ ...hifzArgs(student.id, teacher.id), fromSurah: 95, toSurah: 90 }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordHifz({ ...hifzArgs(student.id, teacher.id), attempts: 0 }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("الحفظ لطالبٍ ليس في مراقي ← يُرفض", async () => {
    const { student, teacher } = await maraqiScaffold();
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.AWAITING_PACE_TEST } });
    await expect(recordHifz(hifzArgs(student.id, teacher.id), prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("الحكم ١ — الفرص الثلاث ووقف الجديد قبل الإتقان", () => {
  const D1 = "2026-05-10";
  const D2 = "2026-05-11";

  it("محاولاتٌ فوق ٣ ← تُرفض", async () => {
    const { student, teacher } = await maraqiScaffold();
    await expect(
      recordHifz({ ...hifzArgs(student.id, teacher.id), attempts: 4 }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("لم يُتقن أمس ← لا حفظ جديد اليوم، ويُعاد المقطع نفسه", async () => {
    const { student, teacher } = await maraqiScaffold();
    // أمس: رسبت الفرص الثلاث (نطاق ٩٠..٩٥، لم يُتقن).
    await recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 90, toSurah: 95 }), date: D1, attempts: 3, mastered: false }, prisma);
    // اليوم: مقطعٌ جديد (٨٠) ← يُرفض.
    await expect(
      recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 80, toSurah: 84 }), date: D2 }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    // اليوم: إعادة المقطع نفسه (٩٠..٩٥) ← مقبول.
    await expect(
      recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 90, toSurah: 95 }), date: D2, attempts: 2, mastered: true }, prisma),
    ).resolves.toBeUndefined();
  });

  it("أُتقن أمس ← جديدٌ اليوم مقبول", async () => {
    const { student, teacher } = await maraqiScaffold();
    await recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 90, toSurah: 95 }), date: D1, mastered: true }, prisma);
    await expect(
      recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 80, toSurah: 84 }), date: D2 }, prisma),
    ).resolves.toBeUndefined();
  });

  it("getHifzGate: يوجب الإعادة إن لم يُتقن السابق، وإلا فلا", async () => {
    const { student, teacher } = await maraqiScaffold();
    await recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 90, toSurah: 95 }), date: D1, attempts: 3, mastered: false }, prisma);
    const gate = await getHifzGate(student.id, D2, prisma);
    expect(gate.mustRepeat).toBe(true);
    expect(gate.range).toEqual({ fromSurah: 90, fromAyah: 1, toSurah: 95, toAyah: 5 });

    // بعد الإتقان ← لا إعادة.
    await recordHifz({ ...hifzArgs(student.id, teacher.id, { fromSurah: 90, toSurah: 95 }), date: D2, mastered: true }, prisma);
    const gate2 = await getHifzGate(student.id, "2026-05-12", prisma);
    expect(gate2.mustRepeat).toBe(false);
  });
});

describe("الحكم ٥ — الترميم الموضعيّ (خطآن في المراجعة ⟵ يعود حفظًا جديدًا)", () => {
  // يُنشئ مقطعًا محفوظًا (جلسة حفظٍ مُتقَنة) ليومٍ برقم سورةٍ مميّز.
  async function addMastered(studentId: string, circleId: string, day: number, fromSurah: number) {
    return prisma.dailySession.create({
      data: {
        studentId, circleId, date: new Date(Date.UTC(2026, 0, day)),
        hifzFromSurah: fromSurah, hifzFromAyah: 1, hifzToSurah: fromSurah, hifzToAyah: 5,
        hifzAttempts: 1, hifzMastered: true, hifzTeacherId: "t",
      },
    });
  }

  // رصد خطأ مراجعةٍ للمقطع يومَ (يناير) day بمقدار count.
  const rerr = (studentId: string, sessionId: string, day: number, count: number, actorId: string) =>
    recordReviewError(
      { studentId, sessionId, date: new Date(Date.UTC(2026, 0, day)), errorCount: count, actorId }, prisma);

  it("خطأ اليوم + خطأ بعد ٣ جلسات (داخل النافذة) ⟵ يُرمّم", async () => {
    const { student, teacher, circle } = await maraqiScaffold();
    const seg1 = await addMastered(student.id, circle.id, 1, 1); // المقطع المُراجَع
    for (let i = 2; i <= 12; i++) await addMastered(student.id, circle.id, i, i);
    // خطأ (يوم ١٢).
    expect((await rerr(student.id, seg1.id, 12, 1, teacher.id)).reverted).toBe(false);
    // ٣ جلسات حفظٍ إضافية.
    for (let i = 13; i <= 15; i++) await addMastered(student.id, circle.id, i, i);
    // خطأ ثانٍ (يوم ١٥) — الأول ما زال داخل آخر ١٠ جلسات ⟵ ترميم.
    expect((await rerr(student.id, seg1.id, 15, 1, teacher.id)).reverted).toBe(true);
    const row = await prisma.dailySession.findUniqueOrThrow({ where: { id: seg1.id } });
    expect(row.repairedAt).not.toBeNull();
    const c = await getConsolidation(student.id, prisma);
    expect(c.review.segments.some((s) => s.id === seg1.id)).toBe(false); // خرج من الراسخ
  });

  it("خطأ + خطأ بعد ١١ جلسة (خرج من النافذة) ⟵ لا يُرمّم", async () => {
    const { student, teacher, circle } = await maraqiScaffold();
    const seg1 = await addMastered(student.id, circle.id, 1, 1);
    for (let i = 2; i <= 12; i++) await addMastered(student.id, circle.id, i, i);
    expect((await rerr(student.id, seg1.id, 12, 1, teacher.id)).reverted).toBe(false);
    // ١١ جلسة إضافية ⟵ خطأ اليوم ١٢ يخرج من نافذة آخر ١٠.
    for (let i = 13; i <= 23; i++) await addMastered(student.id, circle.id, i, i);
    expect((await rerr(student.id, seg1.id, 23, 1, teacher.id)).reverted).toBe(false);
    const row = await prisma.dailySession.findUniqueOrThrow({ where: { id: seg1.id } });
    expect(row.repairedAt).toBeNull(); // لم يُرمّم
  });

  it("خطآن في جلسة واحدة ⟵ يُرمّم (كما كان)", async () => {
    const { student, teacher, circle } = await maraqiScaffold();
    const seg1 = await addMastered(student.id, circle.id, 1, 1);
    for (let i = 2; i <= 12; i++) await addMastered(student.id, circle.id, i, i);
    expect((await rerr(student.id, seg1.id, 12, 2, teacher.id)).reverted).toBe(true);
    const row = await prisma.dailySession.findUniqueOrThrow({ where: { id: seg1.id } });
    expect(row.repairedAt).not.toBeNull();
  });

  it("لا يُرمَّم إلا معلمُ الطالب أو مُسنَدُه (الحكم ٦)", async () => {
    const { student, circle } = await maraqiScaffold();
    const seg = await addMastered(student.id, circle.id, 1, 5);
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(rerr(student.id, seg.id, 1, 2, stranger.id)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("الترسيخ/المراجعة (§٨٫٣ + الحكم ٦) — تسميعٌ مرن", () => {
  it("المعلّم يُسمِّع بنفسه — يُرصد باسمه", async () => {
    const { student, teacher } = await maraqiScaffold();
    await recordTarseekh({ studentId: student.id, date: "2026-05-10", done: true, actorId: teacher.id }, prisma);
    await recordMurajaah({ studentId: student.id, date: "2026-05-10", count: 3, actorId: teacher.id }, prisma);
    const row = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.tarseekhDone).toBe(true);
    expect(row.tarseekhListenerId).toBe(teacher.id);
    expect(row.murajaahCount).toBe(3);
    expect(row.murajaahDone).toBe(true); // مقدارٌ موجب ⟵ تمّ
  });

  it("المعلّم يُسنِد التسميع للعريف — يُسجَّل مَن سمّع، والمسؤولية للمعلّم", async () => {
    const { student, teacher } = await maraqiScaffold();
    const arif = await createUser(prisma, { roles: [Role.ARIF] });
    await recordTarseekh(
      { studentId: student.id, date: "2026-05-10", done: true, actorId: teacher.id, listenerId: arif.id },
      prisma,
    );
    const row = await prisma.dailySession.findFirstOrThrow({ where: { studentId: student.id } });
    expect(row.tarseekhListenerId).toBe(arif.id); // من سمّع = العريف
    // الحدث بصاحب المسؤولية (المعلّم) ويشير إلى الإسناد.
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "TARSEEKH_RECORDED" } });
    expect(ev.actorId).toBe(teacher.id);
  });
});

describe("موضع الطالب (§٨٫٢) — مراقي تنازليّ", () => {
  it("جبهة الحفظ = أدنى موضعٍ حُفظ ← الحزب الحاليّ", async () => {
    const { student, teacher, h60, h59 } = await maraqiScaffold();
    // حفظٌ في نطاق الحزب ٦٠ (سورة ٩٠).
    await recordHifz(hifzArgs(student.id, teacher.id, { fromSurah: 90, toSurah: 95 }), prisma);
    let pos = await getStudentPosition(student.id, prisma);
    expect(pos.current?.stageId).toBe(h60.id);
    expect(pos.current?.hizb).toBe(60);
    // موضع الطالب يُعرض بترتيب الحفظ التنازليّ (الناس ← الأعلى) — عرضٌ فقط.
    expect(pos.current?.label).toBe("الناس 6 - الأعلى 1");

    // ينزل إلى نطاق الحزب ٥٩ (سورة ٨٠) في يومٍ آخر ← الجبهة تصير هناك.
    await recordHifz(
      { ...hifzArgs(student.id, teacher.id, { fromSurah: 80, toSurah: 84 }), date: "2026-05-11" },
      prisma,
    );
    pos = await getStudentPosition(student.id, prisma);
    expect(pos.current?.stageId).toBe(h59.id);
    expect(pos.current?.hizb).toBe(59);
  });

  it("لا جلسات بعد ← لم يبدأ", async () => {
    const { student } = await maraqiScaffold();
    const pos = await getStudentPosition(student.id, prisma);
    expect(pos.started).toBe(false);
    expect(pos.current).toBeNull();
  });
});

describe("موضع الطالب — القاعدة المدنية", () => {
  it("الباب الجاري (IN_PROGRESS)", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const chapter = await prisma.stage.create({
      data: { programId: program.id, kind: StageKind.CHAPTER, ordinal: 3, nameAr: "الباب الثالث" },
    });
    const circle = await prisma.circle.create({
      data: { nameAr: "حلقة قاعدة", timeSlot: "ASR", gender: "MALE", programId: program.id },
    });
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
    await prisma.stageProgress.create({
      data: { studentId: student.id, stageId: chapter.id, state: ProgressState.IN_PROGRESS, startedAt: new Date() },
    });
    const pos = await getStudentPosition(student.id, prisma);
    expect(pos.program).toBe(ProgramKey.QAIDAH_MADANIYYAH);
    expect(pos.current?.stageId).toBe(chapter.id);
    expect(pos.current?.label).toBe("الباب الثالث");
  });
});

describe("عرض الجلسة للمعلم", () => {
  it("يجمع الموضع وجلسة اليوم، ويرفض غير المعلم", async () => {
    const { student, teacher } = await maraqiScaffold();
    await recordHifz(hifzArgs(student.id, teacher.id), prisma);
    const view = await getSessionView(teacher.id, student.id, "2026-05-10", prisma);
    expect(view.student.id).toBe(student.id);
    expect(view.session?.hifzAttempts).toBe(2);
    expect(view.position.current?.hizb).toBe(60);

    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(getSessionView(stranger.id, student.id, "2026-05-10", prisma)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
