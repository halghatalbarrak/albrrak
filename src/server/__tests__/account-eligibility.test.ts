import { Gender } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAccountForStudentReachingThirteen,
  studentsReachingAccountEligibility,
} from "../account-eligibility";
import { acceptApplication, submitApplication } from "../application";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createNationality, createUser } from "../testing/factories";
import { fakeAuthProvider } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// طفل يُقبل وعمره ١٢، ثم يبلغ ١٣ بعد مرور الزمن.
async function acceptTwelveYearOld() {
  const registrar = await createUser(prisma);
  const nat = await createNationality(prisma);
  const app = await submitApplication({
    nameAsInId: "طفل",
    nationalId: "1099999999",
    nationalityId: nat.id,
    birthDate: new Date("2013-01-01"),
    gender: Gender.MALE,
    guardianPhone: "0555777888",
    guardianGender: Gender.MALE,
    studentPhone: null,
  });
  const res = await acceptApplication({
    applicationId: app.id,
    decidedBy: registrar.id,
    asOf: new Date("2025-06-01"), // عمره ١٢
  });
  return { registrar, res };
}

describe("بلوغ الثالثة عشرة — أهلية لا إنشاء تلقائي", () => {
  it("قبل ١٣ ← ليس في قائمة الأهلية؛ بعد ١٣ ← يظهر", async () => {
    const { res } = await acceptTwelveYearOld();

    const before = await studentsReachingAccountEligibility(new Date("2025-06-01"));
    expect(before.some((s) => s.studentId === res.studentId)).toBe(false);

    const after = await studentsReachingAccountEligibility(new Date("2026-06-01"));
    expect(after.some((s) => s.studentId === res.studentId)).toBe(true);
  });

  it("لا إنشاء تلقائي: يبقى بلا دخول حتى فعلٍ صريح بجوال", async () => {
    const { registrar, res } = await acceptTwelveYearOld();

    // لم يُنشأ دخول تلقائيًّا رغم بلوغه ١٣.
    let user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.email).toBeNull();

    // فعلٌ صريح من المُسجِّل، بجوال ← يُنشأ الدخول.
    await createAccountForStudentReachingThirteen({
      studentId: res.studentId,
      phone: "0555222333",
      actorId: registrar.id,
      asOf: new Date("2026-06-01"),
    }, prisma, fakeAuthProvider);
    user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.email).toBe("u0555222333@albrrak.app");
  });

  it("قبل بلوغ ١٣ ← يُرفض الإنشاء ولو طُلب", async () => {
    const { registrar, res } = await acceptTwelveYearOld();
    await expect(
      createAccountForStudentReachingThirteen({
        studentId: res.studentId,
        phone: "0555222333",
        actorId: registrar.id,
        asOf: new Date("2025-06-01"), // ما زال ١٢
      }, prisma, fakeAuthProvider),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
