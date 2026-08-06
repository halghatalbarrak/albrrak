import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { TARSEEKH_WINDOW, getConsolidation, getWeeklyReview } from "../tarseekh";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// الأحكام ٢، ٤، ٩: المقطع = جلسة حفظٍ مُتقَنة؛ الترسيخ = آخر ١٠ جلسات؛ الراسخ = ما قبلها،
// يُوزَّع خُمسًا يوميًّا (⌈الراسخ ÷ ٥⌉).

async function setup() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, program.id);
  const { student } = await createStudent(prisma);
  return { circle, student };
}

// يضيف جلسةَ حفظٍ ليومٍ، مُتقَنة افتراضًا. fromSurah يميّز المقطع للتحقّق.
async function addSession(
  studentId: string, circleId: string, day: number, fromSurah: number, mastered = true,
) {
  const date = new Date(Date.UTC(2026, 0, day)); // يناير 2026، يومٌ متصاعد
  await prisma.dailySession.create({
    data: {
      studentId, circleId, date,
      hifzFromSurah: fromSurah, hifzFromAyah: 1, hifzToSurah: fromSurah, hifzToAyah: 5,
      hifzAttempts: 1, hifzMastered: mastered, hifzTeacherId: "t",
    },
  });
}

describe("نافذة الترسيخ (الحكم ٢+٩) — آخر ١٠ جلسات حفظ", () => {
  it("أقلّ من ١٠ ← كلّها في الترسيخ، ولا راسخ", async () => {
    const { circle, student } = await setup();
    for (let i = 1; i <= 3; i++) await addSession(student.id, circle.id, i, i);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(3);
    expect(c.review.stockCount).toBe(0);
    expect(c.review.khums).toBe(0);
  });

  it("عشرٌ بالضبط ← كلّها ترسيخ، لا راسخ", async () => {
    const { circle, student } = await setup();
    for (let i = 1; i <= 10; i++) await addSession(student.id, circle.id, i, i);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(TARSEEKH_WINDOW);
    expect(c.review.stockCount).toBe(0);
  });

  it("اثنتا عشرة ← آخر ١٠ ترسيخ، وأقدم ٢ راسخ", async () => {
    const { circle, student } = await setup();
    for (let i = 1; i <= 12; i++) await addSession(student.id, circle.id, i, i);
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(10);
    // الترسيخ = الأحدث (الأيام ٣..١٢ ⟵ fromSurah ٣..١٢).
    expect(c.tarseekh.segments.map((s) => s.fromSurah)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // الراسخ = الأقدم (١، ٢).
    expect(c.review.segments.map((s) => s.fromSurah)).toEqual([1, 2]);
    expect(c.review.stockCount).toBe(2);
    expect(c.review.khums).toBe(1); // ⌈٢ ÷ ٥⌉
  });

  it("الجلسة غير المُتقَنة لا تُعدّ مقطعًا", async () => {
    const { circle, student } = await setup();
    await addSession(student.id, circle.id, 1, 1, true);
    await addSession(student.id, circle.id, 2, 2, false); // لم يُتقن
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(1);
    expect(c.tarseekh.segments[0].fromSurah).toBe(1);
  });
});

describe("المراجعة الأسبوعية (الحكم ٤) — خُمس الراسخ", () => {
  it("الخُمس = ⌈الراسخ ÷ ٥⌉", async () => {
    const { circle, student } = await setup();
    // ٢٦ جلسة ← راسخ ١٦ (٢٦ − ١٠) ← خُمس ⌈١٦ ÷ ٥⌉ = ٤.
    for (let i = 1; i <= 26; i++) await addSession(student.id, circle.id, i, ((i - 1) % 114) + 1);
    const c = await getConsolidation(student.id, prisma);
    expect(c.review.stockCount).toBe(16);
    expect(c.review.khums).toBe(4);
  });

  it("فارغٌ بأمان قبل أول حفظ", async () => {
    const { student } = await setup();
    const c = await getConsolidation(student.id, prisma);
    expect(c.tarseekh.segments).toHaveLength(0);
    expect(c.review.stockCount).toBe(0);
    expect(c.review.khums).toBe(0);
  });
});

// يضيف رصدَ مقدارِ مراجعةٍ ليومٍ (بلا حفظ) — لتتبّع الدورة الأسبوعية.
async function addReview(studentId: string, circleId: string, dateUTC: Date, count: number) {
  await prisma.dailySession.create({
    data: { studentId, circleId, date: dateUTC, murajaahCount: count, murajaahDone: count > 0 },
  });
}
const DAY = 86400000;

describe("دورة المراجعة الأسبوعية بالمقدار (الحكم ٤ الموسّع)", () => {
  it("المُنجَز يتراكم عبر أيام الأسبوع، وتكتمل الدورة عند بلوغ المطلوب", async () => {
    const { circle, student } = await setup();
    // ١٥ جلسة حفظٍ مُتقَنة ⟵ الراسخ (المطلوب) = ١٥ − ١٠ = ٥.
    for (let i = 1; i <= 15; i++) await addSession(student.id, circle.id, i, ((i - 1) % 114) + 1);

    // أسبوعُ مراجعةٍ: نحسب أحدَ أسبوعٍ مرجعيّ ثم نرصد على أيامه.
    const ref = new Date(Date.UTC(2026, 2, 4)); // مارس ٢٠٢٦
    const sunday = new Date(ref.getTime() - ref.getUTCDay() * DAY);

    await addReview(student.id, circle.id, sunday, 2);
    let wr = await getWeeklyReview(student.id, sunday, prisma);
    expect(wr.required).toBe(5);
    expect(wr.done).toBe(2);
    expect(wr.remaining).toBe(3);
    expect(wr.percent).toBe(40);
    expect(wr.complete).toBe(false);

    await addReview(student.id, circle.id, new Date(sunday.getTime() + DAY), 2);
    await addReview(student.id, circle.id, new Date(sunday.getTime() + 2 * DAY), 1);
    wr = await getWeeklyReview(student.id, new Date(sunday.getTime() + 2 * DAY), prisma);
    expect(wr.done).toBe(5); // ٢ + ٢ + ١ تراكميًّا
    expect(wr.remaining).toBe(0);
    expect(wr.percent).toBe(100);
    expect(wr.complete).toBe(true);
  });

  it("لا راسخ ⟵ الدورة مكتملةٌ حكمًا", async () => {
    const { student } = await setup();
    const wr = await getWeeklyReview(student.id, new Date(Date.UTC(2026, 2, 4)), prisma);
    expect(wr.required).toBe(0);
    expect(wr.complete).toBe(true);
    expect(wr.percent).toBe(100);
  });
});
