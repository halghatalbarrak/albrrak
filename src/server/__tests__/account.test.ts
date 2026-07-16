import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { provisionStudentLogin, syntheticEmail } from "../account";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";
import { fakeAuthProvider } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("البريد الاصطناعي", () => {
  it("يشتقّ البريد من أرقام الجوال فقط", () => {
    expect(syntheticEmail("+966 55 500 0001")).toBe("u966555000001@albrrak.app");
  });
  it("يرفض جوالًا قصيرًا", () => {
    expect(() => syntheticEmail("123")).toThrow(ValidationError);
  });
});

describe("إنشاء حساب الدخول (م٤)", () => {
  it("إنشاء auth/دخول لمن دون ١٣ ← يُرفض في الخادم", async () => {
    const user = await createUser(prisma);
    await expect(
      provisionStudentLogin(prisma, { userId: user.id, age: 12, phone: "0555000001" }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.email).toBeNull();
  });

  it("١٣+ بجوال ← يُنشأ الدخول (بريد اصطناعي)", async () => {
    const user = await createUser(prisma);
    await provisionStudentLogin(
      prisma,
      { userId: user.id, age: 13, phone: "0555000009" },
      fakeAuthProvider,
    );
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.email).toBe("u0555000009@albrrak.app");
    expect(after.authId).not.toBeNull(); // authId مضبوط عند إنشاء الدخول
  });

  it("١٣+ بلا جوال ← يُرفض", async () => {
    const user = await createUser(prisma);
    await expect(
      provisionStudentLogin(prisma, { userId: user.id, age: 15, phone: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
