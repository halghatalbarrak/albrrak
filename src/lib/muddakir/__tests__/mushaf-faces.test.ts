import { describe, expect, it } from "vitest";

import { JUZ_BOUNDS } from "../../juz-bounds";
import { deriveStages, newFacesForDay, pageContaining, stageForPage, type MushafFaceData } from "../mushaf-faces";

// أوجهٌ وهميّةٌ بصفحات ١..n (المدى غير مهمٍّ لاشتقاق الجديد/المسار).
const makeFaces = (n: number): MushafFaceData[] =>
  Array.from({ length: n }, (_, i) => ({ page: i + 1, fromSurah: 1, fromAyah: 1, toSurah: 114, toAyah: 6 }));

// أوجهٌ مشتقّةٌ من الأجزاء: وجهٌ (صفحة) لكل جزءٍ بمدى آياته من JUZ_BOUNDS. يُثبّت اختبار
// اشتقاق المراحل على بيانات مصحفٍ موقَّعة بلا أرقام صفحاتٍ مكتوبةٍ يدويّاً.
const juzFaces: MushafFaceData[] = JUZ_BOUNDS.map((j) => ({
  page: j.juz,
  fromSurah: j.startSurah,
  fromAyah: j.startAyah,
  toSurah: j.endSurah,
  toAyah: j.endAyah,
}));

describe("newFacesForDay — المسارات ١/٢/٣", () => {
  const faces = makeFaces(604);
  it("المسار ١: وجهٌ واحدٌ تالٍ", () => {
    expect(newFacesForDay(0, 1, faces)).toEqual([1]);
    expect(newFacesForDay(5, 1, faces)).toEqual([6]);
  });
  it("المسار ٢: وجهان تاليان", () => {
    expect(newFacesForDay(0, 2, faces)).toEqual([1, 2]);
    expect(newFacesForDay(5, 2, faces)).toEqual([6, 7]);
  });
  it("المسار ٣: ثلاثة أوجهٍ تالية", () => {
    expect(newFacesForDay(0, 3, faces)).toEqual([1, 2, 3]);
  });
  it("يبدأ من الفاتحة (صفحة ١) وينتهي عند الناس (صفحة ٦٠٤) بلا تجاوز", () => {
    expect(newFacesForDay(603, 3, faces)).toEqual([604]); // يقصّ عند آخر المصحف
    expect(newFacesForDay(604, 1, faces)).toEqual([]); // لا جديدَ بعد الختم
  });
});

describe("pageContaining — إسقاط موضع (سورة:آية) على صفحة الوجه", () => {
  it("يجد صفحة الوجه الحاوية للموضع", () => {
    expect(pageContaining(juzFaces, 1, 1)).toBe(1); // الفاتحة ١ → وجه الجزء ١
    expect(pageContaining(juzFaces, 4, 24)).toBe(5); // بداية الجزء ٥
    expect(pageContaining(juzFaces, 114, 6)).toBe(30); // الناس ٦ → آخر وجه
  });
});

describe("deriveStages + stageForPage — حدود المراحل وانتقالها", () => {
  it("stageJuzCount الافتراضيّ ٥ ⟵ ٦ مراحل، بحدود الأجزاء على صفحات المصحف", () => {
    const stages = deriveStages(juzFaces, 5, JUZ_BOUNDS);
    expect(stages.length).toBe(6);
    expect(stages[0]).toMatchObject({ stage: 1, startJuz: 1, endJuz: 5, startPage: 1, endPage: 5 });
    expect(stages[1]).toMatchObject({ stage: 2, startJuz: 6, endJuz: 10, startPage: 6, endPage: 10 });
    expect(stages[5]).toMatchObject({ stage: 6, startJuz: 26, endJuz: 30, startPage: 26, endPage: 30 });
  });

  it("انتقال المرحلة عند حدّ الصفحة", () => {
    const stages = deriveStages(juzFaces, 5, JUZ_BOUNDS);
    expect(stageForPage(stages, 5)).toBe(1); // آخر صفحةٍ في المرحلة ١
    expect(stageForPage(stages, 6)).toBe(2); // أوّل صفحةٍ في المرحلة ٢
    expect(stageForPage(stages, 30)).toBe(6);
    expect(stageForPage(stages, 31)).toBeNull(); // خارج الحدود
  });

  it("يرفض stageJuzCount أقلّ من ١", () => {
    expect(() => deriveStages(juzFaces, 0, JUZ_BOUNDS)).toThrow();
  });
});
