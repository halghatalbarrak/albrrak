import { describe, expect, it } from "vitest";

import { stageExamAr, tStageExam, type StageExamKey } from "../ar/stage-exam";

describe("قاموس اختبار المرحلة (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tStageExam("pageTitle")).toBe("اختبار المرحلة");
    expect(tStageExam("rankExcellent")).toBe("تميّز");
    expect(tStageExam("etypeForgottenAyah")).toBe("نسيان آية");
  });

  it("كلّ مفتاحٍ يُرجع الأصل حرفاً بحرف", () => {
    for (const key of Object.keys(stageExamAr) as StageExamKey[]) {
      expect(tStageExam(key)).toBe(stageExamAr[key]);
    }
  });
});
