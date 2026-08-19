import { CertificateTemplate, Role, GuardianLinkStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getPublicCertificate, assertCanViewCertificate } from "../certificate-verify";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function certFor(studentId: string, over: { template?: CertificateTemplate; isExcellent?: boolean; revokedAt?: Date } = {}) {
  return prisma.certificate.create({
    data: {
      studentId, template: over.template ?? CertificateTemplate.KHATM, isExcellent: over.isExcellent ?? false,
      verifyToken: `tok-${Math.random().toString(36).slice(2)}-${studentId.slice(-4)}`,
      ...(over.revokedAt ? { revokedAt: over.revokedAt } : {}),
    },
  });
}

describe("getPublicCertificate — الحدّ الأدنى فقط، بلا بياناتٍ خاصّة", () => {
  it("شهادةٌ صحيحة ⟵ الاسم/النوع/التاريخ/الجهة، ولا مفاتيح خاصّة", async () => {
    const { user, student } = await createStudent(prisma);
    await prisma.user.update({ where: { id: user.id }, data: { nameAsInId: "محمد القحطاني", nationalId: "1099887766" } });
    const c = await certFor(student.id, { isExcellent: true });

    const pub = await getPublicCertificate(c.verifyToken, prisma);
    expect(pub).not.toBeNull();
    expect(pub!.valid).toBe(true);
    expect(pub!.recipientName).toBe("محمد القحطاني");
    expect(pub!.type).toContain("ختم القرآن");
    expect(pub!.excellent).toBe(true);
    expect(pub!.issuer).toContain("محمد البراك");
    // لا تسريب بياناتٍ خاصّة.
    const keys = Object.keys(pub!);
    expect(keys).not.toContain("nationalId");
    expect(keys).not.toContain("studentId");
    expect(JSON.stringify(pub)).not.toContain("1099887766");
  });

  it("مُبطَلة ⟵ valid=false و revoked=true", async () => {
    const { student } = await createStudent(prisma);
    const c = await certFor(student.id, { revokedAt: new Date("2026-01-01") });
    const pub = await getPublicCertificate(c.verifyToken, prisma);
    expect(pub!.valid).toBe(false);
    expect(pub!.revoked).toBe(true);
  });

  it("رمزٌ مجهول ⟵ null", async () => {
    expect(await getPublicCertificate("لا-يوجد-هذا-الرمز", prisma)).toBeNull();
  });
});

describe("assertCanViewCertificate — الكادر/الطالب/الوليّ فقط", () => {
  it("الغريب يُرفض، والطالب ووليّه والكادر يمرّون", async () => {
    const { user, student } = await createStudent(prisma);
    const c = await certFor(student.id);

    const stranger = await createUser(prisma, { roles: [] });
    await expect(assertCanViewCertificate(stranger.id, [], c.id, prisma)).rejects.toBeInstanceOf(AuthorizationError);

    await expect(assertCanViewCertificate(user.id, ["STUDENT"], c.id, prisma)).resolves.toBeUndefined(); // الطالب نفسه

    const guardian = await createUser(prisma, { roles: [Role.GUARDIAN] });
    await prisma.guardianLink.create({ data: { guardianId: guardian.id, studentId: student.id, status: GuardianLinkStatus.ACTIVE } });
    await expect(assertCanViewCertificate(guardian.id, [Role.GUARDIAN], c.id, prisma)).resolves.toBeUndefined();

    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await expect(assertCanViewCertificate(manager.id, [Role.CIRCLE_MANAGER], c.id, prisma)).resolves.toBeUndefined();
  });
});
