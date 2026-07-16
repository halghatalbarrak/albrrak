import { Gender, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as appsGET, POST as submitPOST } from "@/app/api/applications/route";
import { GET as studentsGET } from "@/app/api/students/route";
import { POST as decisionPOST } from "@/app/api/applications/[id]/decision/route";
import { GET as meGET } from "@/app/api/me/route";
import { POST as revealPOST } from "@/app/api/applications/[id]/reveal-id/route";
import { acceptApplication, submitApplication } from "../application";
import { prisma, resetDb } from "../testing/helpers";
import { createNationality, createUser } from "../testing/factories";
import { fakeAuthProvider, mintJwt } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

let seq = 0;
async function actor(roles: Role[], opts: { isActive?: boolean } = {}) {
  seq += 1;
  const authId = `authsub-${seq}`;
  const user = await createUser(prisma, {
    roles,
    authId,
    isActive: opts.isActive ?? true,
  });
  const jwt = await mintJwt(authId);
  return { user, jwt };
}

function post(url: string, body: unknown, jwt?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (jwt) headers.authorization = `Bearer ${jwt}`;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}
function get(url: string, jwt?: string) {
  const headers: Record<string, string> = {};
  if (jwt) headers.authorization = `Bearer ${jwt}`;
  return new Request(url, { headers });
}
function bornYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 100);
  return d.toISOString();
}

describe("POST /api/applications — عام بلا مصادقة", () => {
  it("طفل ١٢: 201 بلا مصادقة، ثم القبول (مدير) لا يُنشئ auth", async () => {
    const nat = await createNationality(prisma);
    const manager = await actor([Role.CIRCLE_MANAGER]);

    const res = await submitPOST(
      post("http://t/api/applications", {
        nameAsInId: "طفل صغير",
        nationalId: "1088888888",
        nationalityId: nat.id,
        birthDate: bornYearsAgo(12),
        gender: Gender.MALE,
        guardianPhone: "0555000001",
        guardianGender: Gender.MALE,
      }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const dRes = await decisionPOST(
      post("http://t/api/applications/x/decision", { decision: "accept" }, manager.jwt),
      { params: Promise.resolve({ id }) },
    );
    expect(dRes.status).toBe(200);
    const result = (await dRes.json()) as { userId: string; createdStudentLogin: boolean };
    expect(result.createdStudentLogin).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.email).toBeNull();
    expect(user.authId).toBeNull(); // دون ١٣ ⟵ لا authId (م٤ بنيةً)
  });

  it("إدخال ناقص ← 400", async () => {
    const res = await submitPOST(post("http://t/api/applications", { nameAsInId: "" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/students — رقم الهوية غير موجود في الرد", () => {
  it("بـJWT معلم ← 200 ولا 'nationalId' في الجسم", async () => {
    const userA = await createUser(prisma, { roles: [Role.STUDENT] });
    await prisma.student.create({ data: { userId: userA.id } });
    const teacher = await actor([Role.TEACHER]);

    const res = await studentsGET(get("http://t/api/students", teacher.jwt));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("nationalId");
  });
});

describe("المصادقة والصلاحية على حدّ HTTP", () => {
  it("بلا JWT ← 401", async () => {
    const res = await studentsGET(get("http://t/api/students"));
    expect(res.status).toBe(401);
  });

  it("JWT معلم على قرار القبول ← 403", async () => {
    const teacher = await actor([Role.TEACHER]);
    const res = await decisionPOST(
      post("http://t/api/applications/x/decision", { decision: "accept" }, teacher.jwt),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(403);
  });

  it("JWT لمستخدم معطَّل (isActive=false) ← 403", async () => {
    const disabled = await actor([Role.CIRCLE_MANAGER], { isActive: false });
    const res = await appsGET(get("http://t/api/applications", disabled.jwt));
    expect(res.status).toBe(403);
  });

  it("JWT بتوقيع خاطئ ← 401", async () => {
    const res = await studentsGET(
      get("http://t/api/students", "ey.forged.token"),
    );
    expect(res.status).toBe(401);
  });

  it("دون ١٣ مستحيل انتحاله: لا authId ⟵ JWT بمعرّفه لا يحلّ إلى أحد ← 403/401", async () => {
    // نقبل طفلًا عمره ١٢ ⟵ سجلّ User بلا authId.
    const nat = await createNationality(prisma);
    const registrar = await createUser(prisma);
    const app = await submitApplication({
      nameAsInId: "طفل",
      nationalId: "1077777777",
      nationalityId: nat.id,
      birthDate: new Date("2014-01-01"),
      gender: Gender.MALE,
      guardianPhone: "0555999000",
      guardianGender: Gender.MALE,
      studentPhone: null,
    });
    const res = await acceptApplication(
      { applicationId: app.id, decidedBy: registrar.id, asOf: new Date("2026-01-01") },
      prisma,
      fakeAuthProvider,
    );
    const child = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(child.authId).toBeNull(); // بنيةً: لا هوية مصادقة للطفل

    // محاولة انتحال بـJWT sub = معرّف المستخدم ⟵ لا يطابق authId (null) ⟵ يُرفض.
    const forged = await mintJwt(child.id);
    const r = await studentsGET(get("http://t/api/students", forged));
    expect(r.status).toBe(403);
  });
});

describe("GET /api/me — المستخدم عن نفسه", () => {
  it("طالبٌ يرى صفحته (اسمه وحالته)، بلا رقم هوية", async () => {
    seq += 1;
    const authId = `me-${seq}`;
    const u = await createUser(prisma, { roles: [Role.STUDENT], authId });
    await prisma.student.create({ data: { userId: u.id } });
    const jwt = await mintJwt(authId);

    const res = await meGET(get("http://t/api/me", jwt));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      student: { state: string } | null;
    };
    expect(body.student?.state).toBe("APPLIED");
    expect(JSON.stringify(body)).not.toContain("nationalId");
  });
});

describe("كشف رقم الهوية — للمُسجِّل فقط، بسطر سجل (م٥)", () => {
  async function makeApp() {
    const nat = await createNationality(prisma);
    return submitApplication({
      nameAsInId: "متقدّم",
      nationalId: "1012345678",
      nationalityId: nat.id,
      birthDate: new Date("2010-01-01"),
      gender: Gender.MALE,
      guardianPhone: "0555000123",
      guardianGender: Gender.MALE,
    });
  }

  it("معلم ← 403", async () => {
    const app = await makeApp();
    const teacher = await actor([Role.TEACHER]);
    const res = await revealPOST(
      post(`http://t/api/applications/x/reveal-id`, {}, teacher.jwt),
      { params: Promise.resolve({ id: app.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("مُسجِّل ← يرى الرقم، ويُكتب سطرٌ في سجل الاطّلاع", async () => {
    const app = await makeApp();
    const registrar = await actor([Role.REGISTRAR]);
    const res = await revealPOST(
      post(`http://t/api/applications/x/reveal-id`, {}, registrar.jwt),
      { params: Promise.resolve({ id: app.id }) },
    );
    expect(res.status).toBe(200);
    const { nationalId } = (await res.json()) as { nationalId: string };
    expect(nationalId).toBe("1012345678");
    expect(
      await prisma.nationalIdAccessLog.count({ where: { subjectId: app.id } }),
    ).toBe(1);
  });
});
