import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  decryptNationalId,
  encryptNationalId,
  maskNationalId,
  readNationalId,
} from "../national-id";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("رقم الهوية — تشفير وحجب (م٥)", () => {
  it("التشفير ثم فكّه يرجع الأصل، والنص المخزَّن لا يساوي الأصل", () => {
    const enc = encryptNationalId("1012345678");
    expect(enc).not.toContain("1012345678");
    expect(decryptNationalId(enc)).toBe("1012345678");
  });

  it("الحجب يُبقي آخر ٤ خانات فقط", () => {
    expect(maskNationalId("1012345678")).toBe("••••••5678");
  });
});

describe("قراءة رقم الهوية — تحكّم وسجل (م٥)", () => {
  it("معلم يستعلم عن الهوية ← يُرفض في الخادم", async () => {
    const subject = await createUser(prisma, {
      nationalId: encryptNationalId("1012345678"),
    });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });

    await expect(
      readNationalId({
        viewerId: teacher.id,
        viewerRoles: [Role.TEACHER],
        subjectUserId: subject.id,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    // الرفض لا يترك أثرًا في سجل الاطّلاع.
    expect(await prisma.nationalIdAccessLog.count()).toBe(0);
  });

  it("مُسجِّل مخوّل ← يرى الرقم، ويُكتب سطرٌ في سجل الاطّلاع", async () => {
    const subject = await createUser(prisma, {
      nationalId: encryptNationalId("1012345678"),
    });
    const registrar = await createUser(prisma, { roles: [Role.REGISTRAR] });

    const value = await readNationalId({
      viewerId: registrar.id,
      viewerRoles: [Role.REGISTRAR],
      subjectUserId: subject.id,
      reason: "تحقّق عند القيد",
    });

    expect(value).toBe("1012345678");
    const logs = await prisma.nationalIdAccessLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.viewerId).toBe(registrar.id);
    expect(logs[0]?.subjectId).toBe(subject.id);
  });
});
