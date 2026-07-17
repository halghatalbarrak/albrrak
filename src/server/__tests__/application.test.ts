import { ApplicationStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptApplication,
  rejectApplication,
  submitApplication,
  waitlistApplication,
} from "../application";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { buildApplicationInput, createUser } from "../testing/factories";
import { fakeAuthProvider } from "../testing/auth";

const AS_OF = new Date("2026-07-16");

// عمر مستهدف ⟵ تاريخ ميلاد قبل عيد الميلاد بيومٍ (كي يكون العمر دقيقًا عند AS_OF).
function birth(age: number): Date {
  const d = new Date("2026-07-15T00:00:00Z");
  d.setFullYear(d.getFullYear() - age);
  return d;
}

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function submit(overrides: Partial<Parameters<typeof submitApplication>[0]> = {}) {
  const input = await buildApplicationInput(prisma, { birthDate: birth(15), ...overrides });
  return submitApplication(input);
}

describe("القيد (§٦٫١)", () => {
  it("يُنشئ طلبًا PENDING، ورقم الهوية مشفَّر لا صريح، ويُصدِر حدثًا", async () => {
    const app = await submit();
    expect(app.status).toBe(ApplicationStatus.PENDING);
    expect(app.nationalIdEnc).not.toContain("1012345678");
    expect(app.nationalIdEnc.startsWith("v1:")).toBe(true);
    expect(
      await prisma.event.count({ where: { type: "APPLICATION_SUBMITTED" } }),
    ).toBe(1);
  });
});

describe("القبول ← إنشاء الحساب ← ربط الولي (§٤، §٥)", () => {
  it("طفل ١٢ ← لا حساب دخول، لكن ولي مرتبط، والحالة بانتظار اختبار القراءة", async () => {
    const registrar = await createUser(prisma);
    const app = await submit({ birthDate: birth(12), studentPhone: null });

    const res = await acceptApplication({
      applicationId: app.id,
      decidedBy: registrar.id,
      asOf: AS_OF,
    }, prisma, fakeAuthProvider);

    expect(res.createdStudentLogin).toBe(false);
    expect(res.guardianLinked).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.email).toBeNull(); // لا دخول (م٤)

    const student = await prisma.student.findUniqueOrThrow({ where: { id: res.studentId } });
    expect(student.state).toBe("AWAITING_READING_TEST");

    expect(await prisma.guardianLink.count({ where: { studentId: res.studentId } })).toBe(1);
  });

  it("طالب ١٥ ← حساب دخول + ولي مرتبط بحكم الولاية", async () => {
    const registrar = await createUser(prisma);
    const app = await submit({ birthDate: birth(15), studentPhone: "0555111222" });

    const res = await acceptApplication({
      applicationId: app.id,
      decidedBy: registrar.id,
      asOf: AS_OF,
    }, prisma, fakeAuthProvider);

    expect(res.createdStudentLogin).toBe(true);
    expect(res.guardianLinked).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.email).toBe("u0555111222@albrrak.app"); // له دخول

    // القيد سجلٌّ ثابت — يبقى ويحمل studentId.
    const stored = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(stored.status).toBe(ApplicationStatus.ACCEPTED);
    expect(stored.studentId).toBe(res.studentId);
  });

  it("طالب ١٥ بلا رقم جواله ← يُرفض إنشاء الحساب في الخادم", async () => {
    const registrar = await createUser(prisma);
    const app = await submit({ birthDate: birth(15), studentPhone: null });
    await expect(
      acceptApplication({
        applicationId: app.id,
        decidedBy: registrar.id,
        asOf: AS_OF,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("الرفض والانتظار (§٦٫٢)", () => {
  it("الرفض بلا سبب ← يُرفض؛ وبسبب ← REJECTED", async () => {
    const registrar = await createUser(prisma);
    const app = await submit();
    await expect(
      rejectApplication({ applicationId: app.id, decidedBy: registrar.id, note: "" }),
    ).rejects.toBeInstanceOf(ValidationError);

    const rejected = await rejectApplication({
      applicationId: app.id,
      decidedBy: registrar.id,
      note: "خارج نطاق العمر",
    });
    expect(rejected.status).toBe(ApplicationStatus.REJECTED);
  });

  it("قائمة الانتظار ثم القبول منها", async () => {
    const registrar = await createUser(prisma);
    const app = await submit({ birthDate: birth(15) });
    const wl = await waitlistApplication({
      applicationId: app.id,
      decidedBy: registrar.id,
    });
    expect(wl.status).toBe(ApplicationStatus.WAITLISTED);

    const res = await acceptApplication({
      applicationId: app.id,
      decidedBy: registrar.id,
      asOf: AS_OF,
    }, prisma, fakeAuthProvider);
    expect(res.studentId).toBeTruthy();
  });
});

describe("القبول ينقل الطوارئ والصفة ويُخطر الولي (§٤ + قاعدة ٥)", () => {
  it("١٥ ← الطوارئ على الطالب، الصفة على الرابط، وحدثا GUARDIAN_NOTIFIED + APPLICATION_ACCEPTED", async () => {
    const registrar = await createUser(prisma);
    const input = await buildApplicationInput(prisma, {
      birthDate: birth(15),
      studentPhone: "0555111222",
    });
    const app = await submitApplication(input);
    const res = await acceptApplication(
      { applicationId: app.id, decidedBy: registrar.id, asOf: AS_OF },
      prisma,
      fakeAuthProvider,
    );

    const student = await prisma.student.findUniqueOrThrow({ where: { id: res.studentId } });
    expect(student.emergencyName).toBe(input.emergencyName);
    expect(student.emergencyPhone).toBe(input.emergencyPhone);
    expect(student.emergencyRelationId).toBe(input.emergencyRelationId);

    const link = await prisma.guardianLink.findFirstOrThrow({ where: { studentId: res.studentId } });
    expect(link.relationId).toBe(input.guardianRelationId);

    expect(
      await prisma.event.count({ where: { type: "GUARDIAN_NOTIFIED", subjectId: res.studentId } }),
    ).toBe(1);
    expect(
      await prisma.event.count({ where: { type: "APPLICATION_ACCEPTED", subjectId: app.id } }),
    ).toBe(1);
  });

  it("طفل ١٢ ← جواله يُسجَّل (حتى دون ١٣) بلا حساب، ولا إخطار وليّ", async () => {
    const registrar = await createUser(prisma);
    const input = await buildApplicationInput(prisma, {
      birthDate: birth(12),
      studentPhone: "0556000000",
    });
    const app = await submitApplication(input);
    const res = await acceptApplication(
      { applicationId: app.id, decidedBy: registrar.id, asOf: AS_OF },
      prisma,
      fakeAuthProvider,
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.phone).toBe("0556000000"); // يُسجَّل — فحين يبلغ ١٣ فالتهيئة نقرة
    expect(user.authId).toBeNull(); // لكن لا حساب (م٤)
    expect(await prisma.event.count({ where: { type: "GUARDIAN_NOTIFIED" } })).toBe(0);
  });

  it("بالغ ١٨+ ← لا ربط وليّ ولا إخطار", async () => {
    const registrar = await createUser(prisma);
    const input = await buildApplicationInput(prisma, {
      birthDate: birth(20),
      studentPhone: "0557000000",
    });
    const app = await submitApplication(input);
    const res = await acceptApplication(
      { applicationId: app.id, decidedBy: registrar.id, asOf: AS_OF },
      prisma,
      fakeAuthProvider,
    );
    expect(res.guardianLinked).toBe(false);
    expect(await prisma.event.count({ where: { type: "GUARDIAN_NOTIFIED" } })).toBe(0);
  });
});
