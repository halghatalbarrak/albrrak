import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addReferenceValue,
  listAllReferenceValues,
  setReferenceValueActive,
} from "../list-values";
import { listRegistrationOptions } from "../registration-options";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("إدارة القوائم المرجعية — إضافة/تعطيل (لا حذف)", () => {
  it("الإضافة ترتّب بعد الأخيرة، والمكرّر يُرفض بلا 500", async () => {
    const a = await addReferenceValue({ kind: "nationality", nameAr: "الأولى" }, prisma);
    const b = await addReferenceValue({ kind: "nationality", nameAr: "الثانية" }, prisma);
    expect(a.ordinal).toBe(1);
    expect(b.ordinal).toBe(2);
    await expect(
      addReferenceValue({ kind: "nationality", nameAr: "الأولى" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("التعطيل يُخفي القيمة من نموذج القيد ويُبقيها في شاشة الإدارة", async () => {
    const a = await addReferenceValue({ kind: "nationality", nameAr: "المعطَّلة" }, prisma);
    const b = await addReferenceValue({ kind: "nationality", nameAr: "الفعّالة" }, prisma);

    await setReferenceValueActive({ kind: "nationality", id: a.id, isActive: false }, prisma);

    const opts = await listRegistrationOptions(prisma);
    expect(opts.nationalities.some((n) => n.id === a.id)).toBe(false);
    expect(opts.nationalities.some((n) => n.id === b.id)).toBe(true);

    const all = await listAllReferenceValues(prisma);
    expect(all.nationalities.length).toBe(2); // المعطَّل يبقى للإدارة

    // التفعيل يعيدها.
    await setReferenceValueActive({ kind: "nationality", id: a.id, isActive: true }, prisma);
    const opts2 = await listRegistrationOptions(prisma);
    expect(opts2.nationalities.some((n) => n.id === a.id)).toBe(true);
  });

  it("يعمل على المراحل وصفات القرابة كذلك", async () => {
    const stage = await addReferenceValue({ kind: "schoolStage", nameAr: "دبلوم" }, prisma);
    const rel = await addReferenceValue({ kind: "guardianRelation", nameAr: "كفيل" }, prisma);
    const all = await listAllReferenceValues(prisma);
    expect(all.schoolStages.some((s) => s.id === stage.id)).toBe(true);
    expect(all.guardianRelations.some((r) => r.id === rel.id)).toBe(true);
  });

  it("قيمة غير موجودة عند التعطيل ← ValidationError لا 500", async () => {
    await expect(
      setReferenceValueActive({ kind: "nationality", id: "لا-يوجد", isActive: false }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
