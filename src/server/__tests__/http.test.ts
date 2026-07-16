import { Gender, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as appsGET, POST as submitPOST } from "@/app/api/applications/route";
import { GET as studentsGET } from "@/app/api/students/route";
import { POST as decisionPOST } from "@/app/api/applications/[id]/decision/route";
import { prisma, resetDb } from "../testing/helpers";
import { createNationality, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function get(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}
function bornYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 100); // آمنًا بعد عيد الميلاد
  return d.toISOString();
}

describe("POST /api/applications — عام بلا مصادقة", () => {
  it("طفل ١٢: يُقبل الطلب (٢٠١)، ثم القبول لا يُنشئ auth", async () => {
    const nat = await createNationality(prisma);
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });

    // القيد العام — بلا أي رأس مصادقة.
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

    // القبول من المدير.
    const dRes = await decisionPOST(
      post("http://t/api/applications/x/decision", { decision: "accept" }, {
        "x-actor-id": manager.id,
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(dRes.status).toBe(200);
    const result = (await dRes.json()) as { userId: string; createdStudentLogin: boolean };
    expect(result.createdStudentLogin).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.email).toBeNull(); // لا auth لمن دون ١٣
  });

  it("إدخال ناقص ← 400", async () => {
    const res = await submitPOST(post("http://t/api/applications", { nameAsInId: "" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/students — رقم الهوية غير موجود في الرد", () => {
  it("برأس معلم ← 200، ولا 'nationalId' في الجسم إطلاقًا", async () => {
    await createStudent(prisma);
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });

    const res = await studentsGET(
      get("http://t/api/students", { "x-actor-id": teacher.id }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("nationalId");
    expect(text).not.toContain("nationalIdEnc");
  });
});

describe("الصلاحية على حدّ HTTP", () => {
  it("قرار قبول بلا صلاحية (معلم) ← 403 لا 200", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const res = await decisionPOST(
      post("http://t/api/applications/x/decision", { decision: "accept" }, {
        "x-actor-id": teacher.id,
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(res.status).toBe(403);
  });

  it("قائمة المراجعة بلا رأس مصادقة ← 403", async () => {
    const res = await appsGET(get("http://t/api/applications"));
    expect(res.status).toBe(403);
  });

  it("GET /api/students بلا مصادقة ← 403", async () => {
    const res = await studentsGET(get("http://t/api/students"));
    expect(res.status).toBe(403);
  });
});
