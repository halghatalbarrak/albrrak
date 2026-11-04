import { describe, expect, it } from "vitest";

import {
  parseCsv,
  parseStudentsCsv,
  normalizeArabic,
  matchReference,
  parseGender,
  parseBirthDate,
  nationalIdKey,
  toWesternDigits,
  validateRows,
  IMPORT_COLUMNS,
  type ReferenceItem,
} from "../student-import";

// بيانات وهميّة بحتة — لا بيانات طلابٍ حقيقيّة.
const NAT: ReferenceItem[] = [{ id: "nat-sa", nameAr: "السعودية" }];
const REL: ReferenceItem[] = [
  { id: "rel-ab", nameAr: "الأب" },
  { id: "rel-akh", nameAr: "الأخ" },
];
const ASOF = new Date("2026-01-01T00:00:00Z");

const HEADER = IMPORT_COLUMNS.map((c) => c.ar).join(",");
function csv(...rows: string[][]): string {
  return [HEADER, ...rows.map((r) => r.join(","))].join("\n");
}
// صفٌّ بالترتيب: اسم، هوية، جنسية، ميلاد، جنس طالب، اسم ولي، جنس ولي، صلة ولي، جوال ولي، جوال طالب، اسم طوارئ، صلة طوارئ، جوال طوارئ، حفظ
function row(o: Partial<Record<string, string>>): string[] {
  return IMPORT_COLUMNS.map((c) => o[c.key] ?? "");
}

describe("تطبيع ومطابقة", () => {
  it("toWesternDigits يحوّل المشرقية", () => {
    expect(toWesternDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
  it("normalizeArabic يوحّد الهمزة والتاء المربوطة والمسافات", () => {
    expect(normalizeArabic(" الأب  ")).toBe("الاب");
    expect(normalizeArabic("مدرسة")).toBe("مدرسه");
  });
  it("matchReference يطابق بإسقاط «ال» والمرادفات", () => {
    expect(matchReference("أب", REL)?.id).toBe("rel-ab"); // بإسقاط «ال»
    expect(matchReference("والده", REL, { "والده": "الاب" })?.id).toBe("rel-ab"); // مرادف
    expect(matchReference("سعودي", NAT, { "سعودي": "السعوديه" })?.id).toBe("nat-sa");
    expect(matchReference("مجهول", REL)).toBeNull();
  });
  it("parseGender", () => {
    expect(parseGender("ذكر")).toBe("MALE");
    expect(parseGender("أنثى")).toBe("FEMALE");
    expect(parseGender("")).toBeNull();
    expect(parseGender("xyz")).toBeUndefined();
  });
  it("parseBirthDate يقبل صيغًا متعدّدة ويرفض الخطأ", () => {
    expect(parseBirthDate("2016-05-01")?.getUTCFullYear()).toBe(2016);
    expect(parseBirthDate("01/05/2016")?.getUTCMonth()).toBe(4);
    expect(parseBirthDate("٢٠١٦-٠٥-٠١")?.getUTCFullYear()).toBe(2016);
    expect(parseBirthDate("2016-13-01")).toBeNull();
    expect(parseBirthDate("غير تاريخ")).toBeNull();
  });
  it("nationalIdKey يطبّع الأرقام والمسافات", () => {
    expect(nationalIdKey(" ١٢٣ ٤٥ ")).toBe("12345");
  });
});

describe("parseCsv", () => {
  it("يتعامل مع BOM والاقتباس والفواصل", () => {
    const grid = parseCsv('﻿أ,ب\n"قيمة, بفاصلة","سطر\nداخلي"\n');
    expect(grid[0]).toEqual(["أ", "ب"]);
    expect(grid[1][0]).toBe("قيمة, بفاصلة");
    expect(grid[1][1]).toBe("سطر\nداخلي");
  });
  it("parseStudentsCsv يكشف الأعمدة الناقصة", () => {
    const res = parseStudentsCsv("اسم الطالب,رقم الهوية\nأ,١");
    expect(res.ok).toBe(false);
    expect(res.missingColumns.length).toBeGreaterThan(0);
  });
});

describe("validateRows", () => {
  const ctx = { nationalities: NAT, guardianRelations: REL, existingUserIds: new Set<string>(["3333333333"]), existingApplicationIds: new Set<string>(["5555555555"]), asOf: ASOF };

  it("سطرٌ صالح (طفل) يُحلّ ويأخذ الطوارئ من الوليّ", () => {
    const text = csv(row({
      studentName: "طالب اختبار", nationalId: "1234567890", nationality: "سعودي",
      birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي اختبار",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000001", hifzAmount: "جزء عمّ",
    }));
    const parsed = parseStudentsCsv(text);
    expect(parsed.ok).toBe(true);
    const [r] = validateRows(parsed.rows, ctx);
    expect(r.level).toBe("valid");
    expect(r.resolved?.nationalityId).toBe("nat-sa");
    expect(r.resolved?.guardianRelationId).toBe("rel-ab");
    expect(r.resolved?.emergencyName).toBe("ولي اختبار"); // من الوليّ
    expect(r.resolved?.emergencyPhone).toBe("0500000001"); // من الوليّ
    expect(r.resolved?.emergencyRelationId).toBe("rel-ab"); // صلة الوليّ
    expect(r.resolved?.priorHifzNotes).toBe("جزء عمّ");
    expect(r.maskedId.endsWith("7890")).toBe(true);
  });

  it("هويّة ليست عشرة أرقام ⟵ تحذير لا خطأ (جواز سفر)", () => {
    const text = csv(row({
      studentName: "طالب جواز", nationalId: "AB12345", nationality: "سعودي",
      birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000002",
    }));
    const [r] = validateRows(parseStudentsCsv(text).rows, ctx);
    expect(r.level).toBe("warning");
    expect(r.issues.some((i) => i.code === "idNot10" && i.level === "warning")).toBe(true);
    expect(r.resolved).toBeTruthy();
  });

  it("جنسية غير مطابقة ⟵ خطأ بلا حلّ", () => {
    const text = csv(row({
      studentName: "طالب", nationalId: "1111111111", nationality: "دولة مجهولة",
      birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000003",
    }));
    const [r] = validateRows(parseStudentsCsv(text).rows, ctx);
    expect(r.level).toBe("error");
    expect(r.issues.some((i) => i.code === "nationalityUnmatched")).toBe(true);
    expect(r.resolved).toBeUndefined();
  });

  it("تجاوزٌ يدويّ للجنسية يحلّ السطر", () => {
    const text = csv(row({
      studentName: "طالب", nationalId: "1111111112", nationality: "دولة مجهولة",
      birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000003",
    }));
    const [r] = validateRows(parseStudentsCsv(text).rows, { ...ctx, overrides: { 1: { nationalityId: "nat-sa" } } });
    expect(r.level).toBe("valid");
    expect(r.resolved?.nationalityId).toBe("nat-sa");
  });

  it("تكرارٌ داخل الملفّ ⟵ خطأ على الثاني", () => {
    const base = { nationality: "سعودي", birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي", guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000004" };
    const text = csv(row({ ...base, studentName: "أول", nationalId: "2222222222" }), row({ ...base, studentName: "ثانٍ", nationalId: "2222222222" }));
    const res = validateRows(parseStudentsCsv(text).rows, ctx);
    expect(res[0].level).toBe("valid");
    expect(res[1].issues.some((i) => i.code === "dupInFile")).toBe(true);
  });

  it("مستورَدٌ سابقًا (طالبٌ مقبول) ⟵ تخطٍّ لا خطأ", () => {
    const text = csv(row({
      studentName: "موجود", nationalId: "3333333333", nationality: "سعودي",
      birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000005",
    }));
    const [r] = validateRows(parseStudentsCsv(text).rows, ctx);
    expect(r.level).toBe("skip");
    expect(r.skip).toBe(true);
    expect(r.issues.some((i) => i.code === "alreadyStudent" && i.level === "warning")).toBe(true);
    expect(r.resolved).toBeUndefined(); // لا يُعاد إنشاؤه
  });

  it("له طلبٌ معلّق (Application) ⟵ تخطٍّ لا خطأ", () => {
    const text = csv(row({
      studentName: "معلّق", nationalId: "5555555555", nationality: "سعودي",
      birthDate: "2016-05-01", studentGender: "ذكر", guardianName: "ولي",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000007",
    }));
    const [r] = validateRows(parseStudentsCsv(text).rows, ctx);
    expect(r.level).toBe("skip");
    expect(r.issues.some((i) => i.code === "alreadyPending")).toBe(true);
  });

  it("طالبٌ ≥١٣ بلا جوال ⟵ خطأ", () => {
    const text = csv(row({
      studentName: "مراهق", nationalId: "4444444444", nationality: "سعودي",
      birthDate: "2010-01-01", studentGender: "ذكر", guardianName: "ولي",
      guardianGender: "ذكر", guardianRelation: "أب", guardianPhone: "0500000006",
    }));
    const [r] = validateRows(parseStudentsCsv(text).rows, ctx);
    expect(r.issues.some((i) => i.code === "teenNeedsPhone")).toBe(true);
    expect(r.level).toBe("error");
  });
});
