import { ProgramKey, Role, StageKind, StudentState, HasadErrorType, HasadResult } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { tallyAyahErrors, weaknessLevel, rangeWeakness, getStudentWeaknessMap, tallyAyahStudentCounts, getCircleWeaknessMap, assertCircleAccess } from "../weakness-map";
import { assertTeachesStudent } from "../daily-session";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ── الدالّة النقيّة ──
describe("tallyAyahErrors / weaknessLevel / rangeWeakness — نقيّة", () => {
  it("تجمع الأخطاء بعددها لكل آية، مرتّبةً بالأكثر", () => {
    const t = tallyAyahErrors([
      { pageNo: 604, surah: 114, ayah: 1 },
      { pageNo: 604, surah: 114, ayah: 1 },
      { pageNo: 604, surah: 113, ayah: 5 },
    ]);
    expect(t[0]).toEqual({ pageNo: 604, surah: 114, ayah: 1, count: 2 });
    expect(t.find((x) => x.surah === 113)?.count).toBe(1);
  });

  it("العتبات الثابتة: ١⟵١ · ٢⟵٢ · ٣+⟵٣ · ٠⟵٠", () => {
    expect([0, 1, 2, 3, 9].map(weaknessLevel)).toEqual([0, 1, 2, 3, 3]);
  });

  it("rangeWeakness يجمع أخطاء نطاقٍ (للفكرة ٣)", () => {
    const t = tallyAyahErrors([
      { pageNo: 604, surah: 114, ayah: 1 }, { pageNo: 604, surah: 114, ayah: 1 },
      { pageNo: 604, surah: 114, ayah: 6 }, { pageNo: 604, surah: 113, ayah: 1 },
    ]);
    expect(rangeWeakness(t, { surah: 114, ayah: 1 }, { surah: 114, ayah: 6 })).toBe(3);
    expect(rangeWeakness(t, { surah: 113, ayah: 1 }, { surah: 113, ayah: 5 })).toBe(1);
  });
});

// ── الجلب + الحرّاس ──
async function harvestScaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const sub = await prisma.stage.create({
    data: { programId: program.id, kind: StageKind.SUB_STAGE, ordinal: 1, nameAr: "الناس", hizbNumber: 60, fromSurah: 87, fromAyah: 1, toSurah: 114, toAyah: 6 },
  });
  const circle = await prisma.circle.create({ data: { nameAr: "حلقة", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const reciter = await createUser(prisma, { roles: [Role.RECITER] });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  return { program, sub, circle, teacher, reciter, student };
}

describe("getStudentWeaknessMap — التاريخ الكامل من أخطاء الحصاد", () => {
  it("يجمع أخطاء حصادين على الآية نفسها (لا يُصفَّر) ويشدّ مستواها", async () => {
    await seedMushafFaces(prisma);
    const { sub, reciter, student } = await harvestScaffold();
    // حصادان، وفي كلٍّ خطأٌ عند 114:1 → مجموع ٢ (مستوى ٢).
    for (let i = 0; i < 2; i++) {
      const h = await prisma.hasad.create({ data: { studentId: student.id, stageId: sub.id, reciterId: reciter.id, fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6, result: HasadResult.PASS } });
      await prisma.hasadPageError.create({ data: { hasadId: h.id, pageNo: 604, errorType: HasadErrorType.WORD, surah: 114, ayah: 1 } });
    }
    const map = await getStudentWeaknessMap(student.id, prisma);
    expect(map.totalErrors).toBe(2);
    const a = map.weakestAyahs.find((x) => x.surah === 114 && x.ayah === 1);
    expect(a?.count).toBe(2);
    expect(a?.level).toBe(2);
    expect(map.faces.some((f) => f.pageNo === 604)).toBe(true);
  });

  it("الحارس: معلّمٌ ليس معلّم الطالب ← يُرفض (لا يرى خريطة غيره)", async () => {
    const { student } = await harvestScaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(assertTeachesStudent(stranger.id, student.id, prisma)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ── الفكرة ٢: خريطة الحلقة (عدد الطلاب المتعثّرين لكل آية) ──
describe("tallyAyahStudentCounts — عدد الطلاب المتمايزين لكل آية", () => {
  it("طالبان في الآية نفسها ⟵ ٢؛ وطالبٌ بخطأين في آية ⟵ ١ (distinct)", () => {
    const t = tallyAyahStudentCounts([
      { studentId: "a", pageNo: 604, surah: 114, ayah: 1 },
      { studentId: "b", pageNo: 604, surah: 114, ayah: 1 },
      { studentId: "a", pageNo: 604, surah: 114, ayah: 1 }, // مكرّرٌ لنفس الطالب — لا يُضاعِف
      { studentId: "a", pageNo: 604, surah: 113, ayah: 5 },
    ]);
    expect(t.find((x) => x.surah === 114)?.count).toBe(2);
    expect(t.find((x) => x.surah === 113)?.count).toBe(1);
  });
});

describe("getCircleWeaknessMap + assertCircleAccess", () => {
  it("يعدّ الطلاب المتعثّرين في الآية نفسها عبر الحلقة", async () => {
    await seedMushafFaces(prisma);
    const { sub, reciter, student, circle } = await harvestScaffold();
    // طالبٌ ثانٍ في الحلقة نفسها، يتعثّر في الآية نفسها (114:1).
    const { student: s2 } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: s2.id, circleId: circle.id } });
    await prisma.student.update({ where: { id: s2.id }, data: { state: StudentState.IN_MARAQI } });
    for (const st of [student, s2]) {
      const h = await prisma.hasad.create({ data: { studentId: st.id, stageId: sub.id, reciterId: reciter.id, fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6, result: HasadResult.PASS } });
      await prisma.hasadPageError.create({ data: { hasadId: h.id, pageNo: 604, errorType: HasadErrorType.WORD, surah: 114, ayah: 1 } });
    }
    const map = await getCircleWeaknessMap(circle.id, prisma);
    expect(map.studentCount).toBe(2);
    const a = map.weakestAyahs.find((x) => x.surah === 114 && x.ayah === 1);
    expect(a?.count).toBe(2); // طالبان تعثّرا
    expect(a?.level).toBe(2);
  });

  it("الحارس: معلّمٌ لا يُدرّس الحلقة ← يُرفض؛ والمدير يمرّ", async () => {
    const { circle } = await harvestScaffold();
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(assertCircleAccess(stranger.id, circle.id, prisma)).rejects.toBeInstanceOf(AuthorizationError);
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await expect(assertCircleAccess(mgr.id, circle.id, prisma)).resolves.toBeUndefined();
  });
});
