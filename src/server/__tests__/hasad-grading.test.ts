import { describe, expect, it } from "vitest";

import { gradeHizbHarvest, type HarvestError, type HarvestHesitation } from "../hasad-grading";

// دالّةٌ نقيّة — بلا قاعدة بيانات. اختبارات الحدود (الحكم ٧، قرارات محمد).

const err = (faceNo: number): HarvestError => ({ faceNo, errorType: "WORD" });
const errs = (n: number, faceNo = 1): HarvestError[] =>
  Array.from({ length: n }, () => err(faceNo));
const hes = (faceNo: number, n: number): HarvestHesitation[] =>
  Array.from({ length: n }, () => ({ faceNo }));

describe("محرّك تقدير الحصاد (الحكم ٧) — المراتب على الحدود", () => {
  it("صفر خطأ ⟵ تميّز", () => {
    expect(gradeHizbHarvest({ errors: [], hesitations: [] }).rank).toBe("EXCELLENT");
  });

  it("خطأ واحد ⟵ تميّز (الحدّ الأعلى للتميّز)", () => {
    const g = gradeHizbHarvest({ errors: errs(1), hesitations: [] });
    expect(g.totalErrors).toBe(1);
    expect(g.rank).toBe("EXCELLENT");
  });

  it("خطآن ⟵ اجتياز (أوّل الاجتياز)", () => {
    expect(gradeHizbHarvest({ errors: errs(2), hesitations: [] }).rank).toBe("PASS");
  });

  it("خمسة أخطاء ⟵ اجتياز (الحدّ الأعلى للاجتياز)", () => {
    const g = gradeHizbHarvest({ errors: errs(5), hesitations: [] });
    expect(g.totalErrors).toBe(5);
    expect(g.rank).toBe("PASS");
  });

  it("ستة أخطاء ⟵ رسوب (أوّل الرسوب)", () => {
    const g = gradeHizbHarvest({ errors: errs(6), hesitations: [] });
    expect(g.totalErrors).toBe(6);
    expect(g.rank).toBe("FAIL");
  });
});

describe("محرّك تقدير الحصاد (الحكم ٧) — تحويل التردّد", () => {
  it("تردّدان في وجهٍ واحد ⟵ لا خطأ", () => {
    const g = gradeHizbHarvest({ errors: [], hesitations: hes(1, 2) });
    expect(g.hesitationErrors).toBe(0);
    expect(g.totalErrors).toBe(0);
    expect(g.rank).toBe("EXCELLENT");
  });

  it("ثلاث تردّداتٍ في الوجه نفسه ⟵ خطأ واحد", () => {
    const g = gradeHizbHarvest({ errors: [], hesitations: hes(1, 3) });
    expect(g.hesitationErrors).toBe(1);
    expect(g.totalErrors).toBe(1);
    expect(g.rank).toBe("EXCELLENT"); // خطأ واحد = تميّز
  });

  it("تردّدان في وجهين مختلفين ⟵ لا يصيران خطأ (المتباعدة لا تتراكم)", () => {
    const g = gradeHizbHarvest({ errors: [], hesitations: [...hes(1, 2), ...hes(2, 2)] });
    expect(g.hesitationErrors).toBe(0);
    expect(g.totalErrors).toBe(0);
    expect(g.rank).toBe("EXCELLENT");
  });

  it("ستّ تردّداتٍ في وجهٍ واحد ⟵ خطآن (بلا شرط تتابع)", () => {
    const g = gradeHizbHarvest({ errors: [], hesitations: hes(4, 6) });
    expect(g.hesitationErrors).toBe(2);
    expect(g.hesitationsByFace).toEqual({ 4: 6 });
  });

  it("خمس تردّداتٍ في وجهٍ ⟵ خطأ واحد فقط (⌊٥÷٣⌋)", () => {
    expect(gradeHizbHarvest({ errors: [], hesitations: hes(1, 5) }).hesitationErrors).toBe(1);
  });

  it("التردّد يتراكم مع الأخطاء المباشرة على الحزب ويقلب المرتبة", () => {
    // ٥ أخطاء مباشرة + ٣ تردّداتٍ في وجه = ٦ ⟵ رسوب.
    const g = gradeHizbHarvest({ errors: errs(5), hesitations: hes(2, 3) });
    expect(g.directErrors).toBe(5);
    expect(g.hesitationErrors).toBe(1);
    expect(g.totalErrors).toBe(6);
    expect(g.rank).toBe("FAIL");
  });
});
