import { GuardianLinkStatus, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { linksVisibleToGuardian, requestUnlink } from "../guardian";
import { prisma, resetDb } from "../../test/helpers";
import { createStudent, createUser } from "../../test/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("طلب فكّ الربط لا يظهر للولي (§٤)", () => {
  it("بعد رفع الطلب: لا يراه الولي في أيّ استعلام، ويبقى مخزَّنًا للمدير", async () => {
    const guardian = await createUser(prisma, { roles: [Role.GUARDIAN] });
    const { student, user: studentUser } = await createStudent(prisma);
    const link = await prisma.guardianLink.create({
      data: { guardianId: guardian.id, studentId: student.id },
    });

    await requestUnlink(prisma, {
      guardianLinkId: link.id,
      reason: "سببٌ خاصّ بالطالب",
      requestedByStudentId: studentUser.id,
    });

    // منظور الولي: الحالة ACTIVE (الطلب مخفيّ)، ولا حقل سبب إطلاقًا.
    const visible = await linksVisibleToGuardian(prisma, guardian.id);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.status).toBe("ACTIVE");
    expect(JSON.stringify(visible)).not.toContain("سببٌ خاصّ بالطالب");
    expect(visible[0]).not.toHaveProperty("unlinkReason");

    // منظور المدير (استعلام خام): يرى الطلب وسببه.
    const raw = await prisma.guardianLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(raw.status).toBe(GuardianLinkStatus.UNLINK_REQUESTED);
    expect(raw.unlinkReason).toBe("سببٌ خاصّ بالطالب");

    // وصدر حدثٌ بالطلب.
    expect(
      await prisma.event.count({ where: { type: "GUARDIAN_UNLINK_REQUESTED" } }),
    ).toBe(1);
  });
});
