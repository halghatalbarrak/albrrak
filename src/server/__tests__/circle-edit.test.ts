import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateCircle, getCircleForEdit } from "../circles";
import { ValidationError } from "../errors";

describe("updateCircle — permission", () => {
  it("يرمي circleNotFound إن لم توجد الحلقة", async () => {
    await expect(
      updateCircle("actor", "nonexistent-circle", { nameAr: "أ", timeSlot: "MAGHRIB" as any, gender: "MALE" as any }, prisma),
    ).rejects.toMatchObject({ key: "circleNotFound" });
  });

  it("يرمي circleNameRequired إن كان الاسم فارغاً", async () => {
    await expect(
      updateCircle("actor", "some-id", { nameAr: "   ", timeSlot: "MAGHRIB" as any, gender: "MALE" as any }, prisma),
    ).rejects.toMatchObject({ key: "circleNameRequired" });
  });

  it("يستعمل ValidationError لأخطاء القاعدة", async () => {
    await expect(
      updateCircle("a", "nonexistent", { nameAr: "ب", timeSlot: "MAGHRIB" as any, gender: "MALE" as any }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getCircleForEdit", () => {
  it("يرمي circleNotFound إن لم توجد الحلقة", async () => {
    await expect(getCircleForEdit("nonexistent-id", prisma))
      .rejects.toMatchObject({ key: "circleNotFound" });
  });
});
