/**
 * م٤ — منع الحسابات لمن دون ١٣.
 *
 * الاختبارات:
 * ١. completeActivation يرفض من دون ١٣ (noLoginUnderThirteen).
 * ٢. completeActivation يقبل من عمره ١٣.
 * ٣. enrollInMuddakir يرفض من دون ١٣ (notYetThirteen).
 * ٤. enrollInMuddakir يقبل من عمره ١٣.
 * ٥. listUnder13WithAccounts تُعيد من دون ١٣ ذوي authId فقط.
 */
import { ActivationPurpose, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { completeActivation } from "../user-management";
import { enrollInMuddakir } from "../muddakir-enrollment";
import { listUnder13WithAccounts } from "../under-13";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser, createStudent } from "../testing/factories";
import { fakeAuthProvider } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

function ageDate(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

// ══════════════════════════════════════════════════
// completeActivation
// ══════════════════════════════════════════════════

describe("م٤ — completeActivation", () => {
  it("يرمي noLoginUnderThirteen لمستخدم عمره ١٠", async () => {
    const user = await createUser(prisma, { roles: [Role.STUDENT], authId: "auth-under13" });
    await prisma.user.update({ where: { id: user.id }, data: { birthDate: ageDate(10) } });
    const token = "tok-under13";
    await prisma.activationLink.create({
      data: {
        userId: user.id, token,
        purpose: ActivationPurpose.ACTIVATE,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const err = await completeActivation(token, "password123", prisma, fakeAuthProvider).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).key).toBe("noLoginUnderThirteen");
  });

  it("ينجح لمستخدم عمره ١٣", async () => {
    const user = await createUser(prisma, { roles: [Role.STUDENT], authId: "auth-13yo" });
    await prisma.user.update({ where: { id: user.id }, data: { birthDate: ageDate(13) } });
    const token = "tok-13yo";
    await prisma.activationLink.create({
      data: {
        userId: user.id, token,
        purpose: ActivationPurpose.ACTIVATE,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await expect(completeActivation(token, "password123", prisma, fakeAuthProvider))
      .resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════
// enrollInMuddakir
// ══════════════════════════════════════════════════

describe("م٤ — enrollInMuddakir", () => {
  it("يرمي notYetThirteen لطالب عمره ١٠", async () => {
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { user, student } = await createStudent(prisma);
    await prisma.user.update({ where: { id: user.id }, data: { birthDate: ageDate(10) } });

    const err = await enrollInMuddakir({ studentId: student.id, actorId: manager.id }, prisma).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).key).toBe("notYetThirteen");
  });

  it("ينجح لطالب عمره ١٣", async () => {
    // muddakirProgramId يحتاج برنامج MUDDAKIR
    await prisma.program.upsert({
      where: { key: ProgramKey.MUDDAKIR },
      update: {},
      create: { key: ProgramKey.MUDDAKIR, nameAr: "المُدَّكِر" },
    });
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { user, student } = await createStudent(prisma);
    await prisma.user.update({ where: { id: user.id }, data: { birthDate: ageDate(13) } });

    const result = await enrollInMuddakir({ studentId: student.id, actorId: manager.id }, prisma);
    expect(result.alreadyEnrolled).toBe(false);
  });
});

// ══════════════════════════════════════════════════
// listUnder13WithAccounts
// ══════════════════════════════════════════════════

describe("م٤ — listUnder13WithAccounts", () => {
  it("تُعيد مستخدمين دون ١٣ ذوي authId فقط", async () => {
    // u1: ١٠ سنوات مع authId ← يجب أن يظهر
    const u1 = await createUser(prisma, { roles: [Role.STUDENT] });
    await prisma.user.update({ where: { id: u1.id }, data: { birthDate: ageDate(10), authId: "auth-10yo" } });

    // u2: ١٠ سنوات بلا authId ← لا يظهر
    const u2 = await createUser(prisma, { roles: [Role.STUDENT] });
    await prisma.user.update({ where: { id: u2.id }, data: { birthDate: ageDate(10), authId: null } });

    // u3: ١٥ سنة مع authId ← لا يظهر (عمره أكثر من ١٣)
    const u3 = await createUser(prisma, { roles: [Role.STUDENT] });
    await prisma.user.update({ where: { id: u3.id }, data: { birthDate: ageDate(15), authId: "auth-15yo" } });

    const list = await listUnder13WithAccounts(new Date(), prisma);
    const ids = list.map((r) => r.id);
    expect(ids).toContain(u1.id);
    expect(ids).not.toContain(u2.id);
    expect(ids).not.toContain(u3.id);
  });
});
