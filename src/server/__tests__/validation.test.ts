import { describe, expect, it } from "vitest";
import { parseApplicationInput } from "../validation";

const AS_OF = new Date("2026-01-01");

// جسمٌ صحيح كامل (كما يصل من JSON) — نبدّل منه في كل حالة.
function body(over: Record<string, unknown> = {}) {
  return {
    nameAsInId: "خالد بن عبدالله",
    nationalId: "1012345678",
    nationalityId: "nat1",
    birthDate: "2000-01-01", // بالغ
    gender: "MALE",
    guardianPhone: "0555000001",
    guardianGender: "MALE",
    guardianRelationId: "rel1",
    studentPhone: "0555000002",
    emergencyName: "قريبٌ للطوارئ",
    emergencyPhone: "0555000009",
    emergencyRelationId: "rel2",
    ...over,
  };
}

describe("parseApplicationInput — قواعد الإدخال الجديدة", () => {
  it("جسمٌ صحيح ← يمرّ ويحمل الحقول الإلزامية", () => {
    const out = parseApplicationInput(body(), AS_OF);
    expect(out.guardianRelationId).toBe("rel1");
    expect(out.emergencyName).toBe("قريبٌ للطوارئ");
    expect(out.emergencyRelationId).toBe("rel2");
    expect(out.studentPhone).toBe("0555000002");
  });

  it("صفة الولي غائبة ← يُرفض", () => {
    expect(() => parseApplicationInput(body({ guardianRelationId: "" }), AS_OF)).toThrow(
      /guardianRelationId/,
    );
  });

  it("جهة الطوارئ ناقصة (بلا اسم) ← يُرفض", () => {
    expect(() => parseApplicationInput(body({ emergencyName: "" }), AS_OF)).toThrow(
      /emergencyName/,
    );
  });

  it("جوال الطالب = جوال الولي ← يُرفض برسالةٍ صريحة", () => {
    expect(() =>
      parseApplicationInput(body({ studentPhone: "0555000001" }), AS_OF),
    ).toThrow(/جوال الطالب لا يكون نفس جوال ولي الأمر/);
  });

  it("جوال الطوارئ = جوال الولي ← يُرفض برسالةٍ صريحة", () => {
    expect(() =>
      parseApplicationInput(body({ emergencyPhone: "0555000001" }), AS_OF),
    ).toThrow(/جوال الطوارئ لا يكون نفس جوال ولي الأمر/);
  });

  it("التصادم بالأرقام لا بالنصّ (فراغات/رموز) ← يُرفض أيضًا", () => {
    expect(() =>
      parseApplicationInput(body({ emergencyPhone: "0555 000 001" }), AS_OF),
    ).toThrow(/جوال الطوارئ/);
  });

  it("بالغ (١٣+) بلا جوال ← يُرفض (الجوال شرط حسابه)", () => {
    expect(() =>
      parseApplicationInput(body({ studentPhone: "" }), AS_OF),
    ).toThrow(/بلغ الثالثة عشرة/);
  });

  it("دون ١٣ بلا جوال ← يمرّ (اختياري)", () => {
    const out = parseApplicationInput(
      body({ birthDate: "2016-01-01", studentPhone: "" }),
      AS_OF,
    );
    expect(out.studentPhone).toBeNull();
  });

  it("دون ١٣ بجوالٍ خاصّ ← يُسجَّل", () => {
    const out = parseApplicationInput(
      body({ birthDate: "2016-01-01", studentPhone: "0556000000" }),
      AS_OF,
    );
    expect(out.studentPhone).toBe("0556000000");
  });
});
