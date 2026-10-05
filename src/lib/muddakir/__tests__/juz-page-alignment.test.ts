import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { juzBoundsFromHizb, type HizbRow } from "../juz-from-hizb";
import { deriveStages, stageForPage, type MushafFaceData } from "../mushaf-faces";

// توثيقٌ من بيانات المصحف الموقَّعة (قرار §١): الصفحة المقسومة بين جزأين تتبع جزء أوّل آيتها،
// فحدود المراحل بالصفحات. يثبّت هذا الاختبار: (أ) الأجزاء التي تبدأ وسط صفحةٍ هي ٤ و٧ و١١ و٢٦
// بالضبط، (ب) الصفحات ١..٦٠٤ تنقسم على المراحل بلا فجوةٍ ولا تكرار، (ج) حدود المراحل الستّ.

const HIZB: HizbRow[] = JSON.parse(readFileSync(join(process.cwd(), "hizb_boundaries.json"), "utf8"));
const FACES: MushafFaceData[] = JSON.parse(readFileSync(join(process.cwd(), "mushaf_faces.json"), "utf8"));
const JUZ = juzBoundsFromHizb(HIZB);
const STAGE_JUZ_COUNT = 5; // §٩ الافتراضيّ

// حدود المراحل الستّ المتوقَّعة (بالصفحات) وفق القرار — الصفحة ٢٠١ للمرحلة ٢، و٥٠٢ للمرحلة ٥.
const EXPECTED = [
  { stage: 1, startJuz: 1, endJuz: 5, startPage: 1, endPage: 101 },
  { stage: 2, startJuz: 6, endJuz: 10, startPage: 102, endPage: 201 },
  { stage: 3, startJuz: 11, endJuz: 15, startPage: 202, endPage: 301 },
  { stage: 4, startJuz: 16, endJuz: 20, startPage: 302, endPage: 401 },
  { stage: 5, startJuz: 21, endJuz: 25, startPage: 402, endPage: 502 },
  { stage: 6, startJuz: 26, endJuz: 30, startPage: 503, endPage: 604 },
];

describe("محاذاة الأجزاء بالصفحات (قرار §١، من بيانات المصحف)", () => {
  it("الأجزاء التي تبدأ وسط صفحةٍ هي ٤ و٧ و١١ و٢٦ بالضبط", () => {
    const pageStart = new Set(FACES.map((f) => `${f.fromSurah}:${f.fromAyah}`));
    const midPage = JUZ.filter((j) => !pageStart.has(`${j.startSurah}:${j.startAyah}`)).map((j) => j.juz);
    expect(midPage).toEqual([4, 7, 11, 26]);
  });

  it("حدود المراحل الستّ بالصفحات كما في القاعدة", () => {
    expect(deriveStages(FACES, STAGE_JUZ_COUNT, JUZ)).toEqual(EXPECTED);
  });

  it("كل صفحةٍ من ١ إلى ٦٠٤ تنتمي لمرحلةٍ واحدةٍ فقط، بلا فجوةٍ ولا تكرار", () => {
    const stages = deriveStages(FACES, STAGE_JUZ_COUNT, JUZ);
    expect(FACES.length).toBe(604);
    for (let page = 1; page <= 604; page++) {
      const hits = stages.filter((s) => page >= s.startPage && page <= s.endPage);
      expect(hits.length, `الصفحة ${page} في ${hits.length} مرحلة`).toBe(1); // لا فجوة ولا تكرار
    }
    // الحدود متلاصقةٌ: نهاية كل مرحلةٍ + ١ = بداية التالية.
    for (let i = 1; i < stages.length; i++) {
      expect(stages[i].startPage).toBe(stages[i - 1].endPage + 1);
    }
    expect(stageForPage(stages, 201)).toBe(2); // الصفحة المقسومة ⟵ المرحلة السابقة
    expect(stageForPage(stages, 502)).toBe(5);
  });
});
