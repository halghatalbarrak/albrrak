import { MuddakirFaceState, ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { firstAyahOfPage, linkingAyahForLastPage } from "../mushaf-lines";
import { todayPlan } from "../muddakir-day";
import { enrollInMuddakir } from "../muddakir-enrollment";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// §٤٫١ الآية الرابطة: حصّة الحفظ = الأوجه + أوّل آيةٍ من الصفحة التالية، كاملةً. ليست وجهاً، ولا
// رابطة بعد ٦٠٤، والحدود من MushafLine. (لا vitest محليّاً — على CI فقط.)

const line1 = (page: number, surah: number, ayah: number) =>
  prisma.mushafLine.create({ data: { page, lineNo: 1, startSurah: surah, startAyah: ayah, endSurah: surah, endAyah: ayah } });

describe("linkingAyahForLastPage — حساب الآية الرابطة من خريطة الأسطر", () => {
  it("وجهٌ عاديّ: الرابطة = أوّل آية الصفحة التالية", async () => {
    await line1(11, 2, 16);
    expect(await linkingAyahForLastPage(10)).toEqual({ surah: 2, ayah: 16 });
  });

  it("الصفحة ٤٧: الرابطة تنتهي عند آية الدَّين ٢:٢٨٢ (أوّل آية الصفحة ٤٨)", async () => {
    await line1(48, 2, 282);
    expect(await linkingAyahForLastPage(47)).toEqual({ surah: 2, ayah: 282 });
  });

  it("صفحةٌ تليها بدايةُ سورة: الرابطة = الآية الأولى من السورة الجديدة", async () => {
    await line1(22, 3, 1); // آل عمران ١ تبدأ الصفحة ٢٢
    expect(await linkingAyahForLastPage(21)).toEqual({ surah: 3, ayah: 1 });
  });

  it("حدّ المرحلة: الصفحة ١٠١ تمتدّ رابطتها إلى أوّل آية الصفحة ١٠٢", async () => {
    await line1(102, 5, 27);
    expect(await linkingAyahForLastPage(101)).toEqual({ surah: 5, ayah: 27 });
  });

  it("الصفحة ٦٠٤: لا رابطة (لا صفحة ٦٠٥)", async () => {
    expect(await linkingAyahForLastPage(604)).toBeNull();
    expect(await linkingAyahForLastPage(605)).toBeNull();
  });

  it("مسار وجهين: الرابطة بعد الوجه الثاني فقط", async () => {
    await line1(51, 2, 100); // الوجه الثاني في حصّةٍ أوجهها ٥٠ و٥١
    await line1(52, 2, 120); // أوّل الصفحة التالية = الرابطة
    // الرابطة بعد آخر وجهٍ (٥١) = أوّل آية ٥٢، لا أوّل آية ٥١ (وهو الوجه الثاني نفسه).
    expect(await linkingAyahForLastPage(51)).toEqual({ surah: 2, ayah: 120 });
    expect(await firstAyahOfPage(51)).toEqual({ surah: 2, ayah: 100 });
  });
});

// ── تكامل: الرابطة لا تمسّ الأوجه ولا حالاتها (§٤٫١) ──

async function scaffoldTrack2() {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const def: Record<string, unknown> = { newReps: 5, firstCleanReps: 3, yesterdayReps: 10, ribatWindowDays: { "1": 20, "2": 15, "3": 10 }, reviewCycleDays: 7, tracks: [1, 2, 3] };
  await prisma.setting.createMany({ data: Object.entries(def).map(([key, value]) => ({ programId: mud.id, key, value: value as never })) });
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  await prisma.muddakirProfile.update({ where: { studentId: student.id }, data: { track: 2 } });
  return { student };
}

describe("todayPlan — الرابطة ذيلٌ للحصّة لا وجهٌ ولا تغيّر حالات", () => {
  it("مسار وجهين: الرابطة بعد الوجه الثاني، وعدد الأوجه وحالاتها لا يتغيّران", async () => {
    const { student } = await scaffoldTrack2();
    await seedMushafFaces(prisma); // حدود الأوجه ١..٦٠٤
    await line1(3, 2, 30); // أوّل آية الصفحة ٣ = الرابطة بعد الوجهين ١ و٢
    const D = "2026-05-10";

    const plan = await todayPlan(student.id, D, prisma, new Date(`${D}T12:00:00.000Z`));

    expect(plan.newFaces).toEqual([1, 2]); // وجهان
    expect(plan.linkingAyah).toEqual({ surah: 2, ayah: 30 }); // بعد الوجه الثاني (٣)، لا الأوّل
    expect(plan.newRange?.toSurah).toBe(2);
    expect(plan.newRange?.toAyah).toBe(30); // الحصّة تنتهي بالرابطة

    // الرابطة ليست وجهاً: لا صفٌّ للوجه ٣، وكلّ الأوجه NEW (لم تتغيّر حالةٌ بسببها).
    const faces = await prisma.muddakirFace.findMany({ where: { studentId: student.id } });
    expect(faces.some((f) => f.page === 3)).toBe(false);
    expect(faces.every((f) => f.state === MuddakirFaceState.NEW)).toBe(true);
  });
});
