import { ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  appointArif,
  dismissArif,
  isActiveArifForCircle,
  listCircleArifs,
} from "../arif";
import { recordHifz, recordMurajaah, recordReviewError, recordTarseekh } from "../daily-session";
import { canExamine } from "../examiner-eligibility";
import { recordHasad } from "../hasad";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// يبذر للطالب مقاطعَ حفظٍ مُتقنة: أوّلًا مقاطع «التغطية» (تصير راسخة)، ثم ١٠ مقاطع لاحقة
// (نافذة الترسيخ) تُخرج ما قبلها إلى الراسخ (الحكم ٢). حزب ٦٠ = ٨٧:١ ← ١١٤:٦ (HizbBoundary).
async function giveRasikh(
  studentId: string,
  circleId: string,
  coverRanges: [number, number, number, number][],
) {
  let day = 1;
  for (const [fs, fa, ts, ta] of coverRanges) {
    await prisma.dailySession.create({
      data: {
        studentId, circleId,
        date: new Date(`2026-01-${String(day).padStart(2, "0")}`),
        hifzFromSurah: fs, hifzFromAyah: fa, hifzToSurah: ts, hifzToAyah: ta, hifzMastered: true,
      },
    });
    day++;
  }
  for (let i = 1; i <= 10; i++) {
    await prisma.dailySession.create({
      data: {
        studentId, circleId,
        date: new Date(`2026-02-${String(i).padStart(2, "0")}`),
        hifzFromSurah: 86, hifzFromAyah: 1, hifzToSurah: 86, hifzToAyah: 1, hifzMastered: true,
      },
    });
  }
}

// حلقة مراقي بمعلّمها، وطالبان منتسبان: أحدهما عريفٌ محتمَل، والآخر زميلٌ يُسمِّع له العريف.
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await prisma.circle.create({
    data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id },
  });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const arif = await createStudent(prisma); // { user, student }
  const peer = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: arif.student.id, circleId: circle.id } });
  await prisma.enrollment.create({ data: { studentId: peer.student.id, circleId: circle.id } });
  // مرجع حدود الأحزاب (يمسحه resetDb): نبذر حزب ٦٠ لقياس التغطية — كما في maraqi.test.
  await prisma.hizbBoundary.create({
    data: {
      hizb: 60, juz: 30, startSurahNum: 87, startSurah: "الأعلى", startAyah: 1,
      endSurahNum: 114, endSurah: "الناس", endAyah: 6,
    },
  });
  // العريف مؤهَّل: رسخ من حفظه حزبٌ كامل (حزب ٦٠) — شرط الحكم ٨.
  await giveRasikh(arif.student.id, circle.id, [[87, 1, 114, 6]]);
  return { program, circle, teacher, arif, peer };
}

describe("تعيين العريف (الحكم ٨)", () => {
  it("المعلّم يعيّن طالباً من حلقته عريفاً", async () => {
    const { circle, teacher, arif } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await isActiveArifForCircle(arif.user.id, circle.id, prisma)).toBe(true);
    expect(await listCircleArifs(circle.id, prisma)).toHaveLength(1);
  });

  it("غير معلّم الحلقة لا يعيّن (يُرفض في الخادم)", async () => {
    const { circle, arif } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: stranger.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا يُعيَّن إلا طالبٌ منتسبٌ للحلقة نفسها", async () => {
    const { circle, teacher } = await scaffold();
    const outsider = await createStudent(prisma); // غير منتسب لهذه الحلقة
    await expect(
      appointArif({ circleId: circle.id, arifUserId: outsider.user.id, teacherId: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("أهليّة العريف — راسخه ≥ حزب كامل (الحكم ٨)", () => {
  it("من راسخه أقلّ من حزبٍ كامل ⟵ يُرفض", async () => {
    const { circle, teacher } = await scaffold();
    // طالبٌ منتسبٌ لكن راسخه جزءٌ من حزب ٦٠ فقط (٩٠:١ ← ٩٣:٥) — لا يبلغ حزبًا كاملًا.
    const weak = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: weak.student.id, circleId: circle.id } });
    await giveRasikh(weak.student.id, circle.id, [[90, 1, 93, 5]]);
    await expect(
      appointArif({ circleId: circle.id, arifUserId: weak.user.id, teacherId: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("من بلغ راسخُه حزبًا كاملًا ⟵ يُقبل", async () => {
    const { circle, teacher } = await scaffold();
    // طالبٌ منتسبٌ رسخ من حفظه حزبٌ كامل (حزب ٦٠: ٨٧:١ ← ١١٤:٦).
    const able = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: able.student.id, circleId: circle.id } });
    await giveRasikh(able.student.id, circle.id, [[87, 1, 114, 6]]);
    await appointArif({ circleId: circle.id, arifUserId: able.user.id, teacherId: teacher.id }, prisma);
    expect(await isActiveArifForCircle(able.user.id, circle.id, prisma)).toBe(true);
  });

  it("عريفٌ راسخُه حزب ⟵ ترميمٌ يُنقصه ⟵ يُعزل آليًّا ولا يُسمِّع بعدها", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await isActiveArifForCircle(arif.user.id, circle.id, prisma)).toBe(true);

    // المقطع المُغطّي لحزب ٦٠ (أقدم مقطعٍ راسخٍ للعريف).
    const covering = await prisma.dailySession.findFirstOrThrow({
      where: { studentId: arif.student.id, hifzFromSurah: 87 },
    });
    // خطآن في مراجعته داخل النافذة ⟵ ترميم (الحكم ٥) ⟵ يخرج من الراسخ فينزل تحت حزب.
    const res = await recordReviewError(
      { sessionId: covering.id, studentId: arif.student.id, date: "2026-02-15", errorCount: 2, actorId: teacher.id },
      prisma,
    );
    expect(res.reverted).toBe(true);

    // عُزِل آليًّا في حينه (الحكم ٨ — الشرط دائم).
    expect(await isActiveArifForCircle(arif.user.id, circle.id, prisma)).toBe(false);
    // ولا يُسمِّع بعد العزل.
    await expect(
      recordTarseekh({ studentId: peer.student.id, date: "2026-05-12", done: true, actorId: arif.user.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("حدود العريف (الحكم ٨) — يُسمِّع لا يختبر ولا حفظ جديد", () => {
  it("يُسمِّع الترسيخ والمراجعة (مسموح)، ويُسجَّل باسمه", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    await expect(
      recordTarseekh({ studentId: peer.student.id, date: "2026-05-10", done: true, actorId: arif.user.id }, prisma),
    ).resolves.toBeUndefined();
    await expect(
      recordMurajaah({ studentId: peer.student.id, date: "2026-05-10", count: 2, actorId: arif.user.id }, prisma),
    ).resolves.toBeUndefined();
    const row = await prisma.dailySession.findFirstOrThrow({ where: { studentId: peer.student.id } });
    expect(row.tarseekhListenerId).toBe(arif.user.id);
  });

  it("لا يُسمِّع الحفظ الجديد (حصريّ للمعلّم) — يُرفض", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    await expect(
      recordHifz(
        { studentId: peer.student.id, teacherId: arif.user.id, date: "2026-05-10", fromSurah: 90, fromAyah: 1, toSurah: 95, toAyah: 5, attempts: 1, mastered: true },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا يختبر (الاختبار محايد) — canExamine=false والحصاد يُرفض", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await canExamine({ examinerUserId: arif.user.id, studentId: peer.student.id }, prisma)).toBe(false);
    await expect(
      recordHasad({ studentId: peer.student.id, stageId: "x", reciterId: arif.user.id, errors: [] }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("بعد العزل: لا يُسمِّع", async () => {
    const { circle, teacher, arif, peer } = await scaffold();
    await appointArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    await dismissArif({ circleId: circle.id, arifUserId: arif.user.id, teacherId: teacher.id }, prisma);
    expect(await isActiveArifForCircle(arif.user.id, circle.id, prisma)).toBe(false);
    await expect(
      recordTarseekh({ studentId: peer.student.id, date: "2026-05-11", done: true, actorId: arif.user.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
