import { Gender, ProgramKey, Role, StudentState, TimeSlot } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as appsGET, POST as submitPOST } from "@/app/api/applications/route";
import { GET as studentsGET } from "@/app/api/students/route";
import { GET as adminStudentsGET } from "@/app/api/admin/students/route";
import { POST as studentRevealPOST } from "@/app/api/students/[id]/reveal-id/route";
import { POST as readingTestPOST } from "@/app/api/students/[id]/reading-test/route";
import { POST as placementDecisionPOST } from "@/app/api/placements/[id]/decision/route";
import { GET as circlesGET, POST as circlesPOST } from "@/app/api/admin/circles/route";
import { proposeReadingTest } from "../placement";
import { POST as decisionPOST } from "@/app/api/applications/[id]/decision/route";
import { GET as meGET } from "@/app/api/me/route";
import { POST as revealPOST } from "@/app/api/applications/[id]/reveal-id/route";
import { POST as emergencyPOST } from "@/app/api/students/[id]/emergency/route";
import { GET as listsGET } from "@/app/api/admin/lists/route";
import { GET as pendingGET } from "@/app/api/admin/pending-count/route";
import { acceptApplication, submitApplication } from "../application";
import { encryptNationalId } from "../national-id";
import { prisma, resetDb } from "../testing/helpers";
import {
  buildApplicationInput,
  createCircle,
  createGuardianRelation,
  createNationality,
  createProgram,
  createStudent,
  createUser,
} from "../testing/factories";
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
    const rel = await createGuardianRelation(prisma);
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
        guardianRelationId: rel.id,
        emergencyName: "جهة الطوارئ",
        emergencyPhone: "0555000055",
        emergencyRelationId: rel.id,
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
    const registrar = await createUser(prisma);
    const app = await submitApplication(
      await buildApplicationInput(prisma, {
        nameAsInId: "طفل",
        nationalId: "1077777777",
        birthDate: new Date("2014-01-01"),
        guardianPhone: "0555999000",
        studentPhone: null,
      }),
    );
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

describe("جهة الطوارئ على حدّ HTTP — لمعلّم الطالب فقط، وإلا 401/403", () => {
  async function enrolledStudent() {
    const program = await createProgram(prisma);
    const circle = await createCircle(prisma, program.id);
    const rel = await createGuardianRelation(prisma);
    const { student } = await createStudent(prisma);
    await prisma.student.update({
      where: { id: student.id },
      data: { emergencyName: "قريب", emergencyPhone: "0555111000", emergencyRelationId: rel.id },
    });
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
    return { circle, student };
  }

  it("بلا JWT ← 401", async () => {
    const { student } = await enrolledStudent();
    const res = await emergencyPOST(post("http://t/x", {}), {
      params: Promise.resolve({ id: student.id }),
    });
    expect(res.status).toBe(401);
  });

  it("معلّمٌ ليس معلّمه ← 403", async () => {
    const { student } = await enrolledStudent();
    const teacher = await actor([Role.TEACHER]);
    const res = await emergencyPOST(post("http://t/x", {}, teacher.jwt), {
      params: Promise.resolve({ id: student.id }),
    });
    expect(res.status).toBe(403);
  });

  it("معلّم الطالب ← 200 وجوال الطوارئ", async () => {
    const { circle, student } = await enrolledStudent();
    const teacher = await actor([Role.TEACHER]);
    await prisma.circleTeacher.create({
      data: { circleId: circle.id, teacherId: teacher.user.id },
    });
    const res = await emergencyPOST(post("http://t/x", {}, teacher.jwt), {
      params: Promise.resolve({ id: student.id }),
    });
    expect(res.status).toBe(200);
    const contact = (await res.json()) as { phone: string };
    expect(contact.phone).toBe("0555111000");
  });
});

describe("قائمة الطلاب وكشف الهوية على حدّ HTTP", () => {
  it("قائمة الطلاب: مدير 200، معلّم 403", async () => {
    const manager = await actor([Role.CIRCLE_MANAGER]);
    const teacher = await actor([Role.TEACHER]);
    expect((await adminStudentsGET(get("http://t/api/admin/students", manager.jwt))).status).toBe(200);
    expect((await adminStudentsGET(get("http://t/api/admin/students", teacher.jwt))).status).toBe(403);
  });

  it("كشف هوية طالب: مُسجِّل ← 200 وسطرُ اطّلاع، معلّم ← 403", async () => {
    const u = await createUser(prisma, {
      roles: [Role.STUDENT],
      nationalId: encryptNationalId("1033445566"),
    });
    const student = await prisma.student.create({ data: { userId: u.id } });
    const registrar = await actor([Role.REGISTRAR]);
    const teacher = await actor([Role.TEACHER]);

    const rej = await studentRevealPOST(post("http://t/x", {}, teacher.jwt), {
      params: Promise.resolve({ id: student.id }),
    });
    expect(rej.status).toBe(403);

    const ok = await studentRevealPOST(post("http://t/x", {}, registrar.jwt), {
      params: Promise.resolve({ id: student.id }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { nationalId: string };
    expect(body.nationalId).toBe("1033445566");
    expect(await prisma.nationalIdAccessLog.count({ where: { subjectId: u.id } })).toBe(1);
  });
});

describe("التحديد والحلقات على حدّ HTTP", () => {
  async function awaitingStudent() {
    const { student } = await createStudent(prisma);
    await prisma.student.update({
      where: { id: student.id },
      data: { state: StudentState.AWAITING_READING_TEST },
    });
    return student;
  }

  it("تسجيل اختبار القراءة: مُسجِّل ← 201، معلّم ← 403", async () => {
    const student = await awaitingStudent();
    const registrar = await actor([Role.REGISTRAR]);
    const teacher = await actor([Role.TEACHER]);

    const rej = await readingTestPOST(
      post("http://t/x", { readsFluently: true, notes: "x" }, teacher.jwt),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(rej.status).toBe(403);

    const ok = await readingTestPOST(
      post("http://t/x", { readsFluently: true, notes: "يقرأ بطلاقة" }, registrar.jwt),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(ok.status).toBe(201);
  });

  it("اعتماد التحديد: مدير ← 200 وينفّذ، معلّم ← 403", async () => {
    const student = await awaitingStudent();
    const registrar = await createUser(prisma, { roles: [Role.REGISTRAR] });
    const approval = await proposeReadingTest({
      studentId: student.id,
      examinerId: registrar.id,
      notes: "يقرأ",
      readsFluently: true,
    });
    const manager = await actor([Role.CIRCLE_MANAGER]);
    const teacher = await actor([Role.TEACHER]);

    const rej = await placementDecisionPOST(
      post("http://t/x", { decision: "APPROVED" }, teacher.jwt),
      { params: Promise.resolve({ id: approval.id }) },
    );
    expect(rej.status).toBe(403);

    const ok = await placementDecisionPOST(
      post("http://t/x", { decision: "APPROVED" }, manager.jwt),
      { params: Promise.resolve({ id: approval.id }) },
    );
    expect(ok.status).toBe(200);
    const fresh = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(fresh.state).toBe(StudentState.AWAITING_PACE_TEST);
  });

  it("الحلقات: إنشاء للمدير 201 وللمعلّم 403، والقراءة للمُسجِّل 200", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const manager = await actor([Role.CIRCLE_MANAGER]);
    const teacher = await actor([Role.TEACHER]);
    const registrar = await actor([Role.REGISTRAR]);

    const body = { nameAr: "حلقة", timeSlot: TimeSlot.MAGHRIB, gender: Gender.MALE, programId: program.id };
    expect((await circlesPOST(post("http://t/x", body, teacher.jwt))).status).toBe(403);
    expect((await circlesPOST(post("http://t/x", body, manager.jwt))).status).toBe(201);
    expect((await circlesGET(get("http://t/api/admin/circles", registrar.jwt))).status).toBe(200);
  });
});

describe("شاشات المدير على حدّ HTTP — مدير 200، معلّم 403", () => {
  it("إدارة القوائم", async () => {
    const manager = await actor([Role.CIRCLE_MANAGER]);
    const teacher = await actor([Role.TEACHER]);
    expect((await listsGET(get("http://t/api/admin/lists", manager.jwt))).status).toBe(200);
    expect((await listsGET(get("http://t/api/admin/lists", teacher.jwt))).status).toBe(403);
  });

  it("عدّاد المعلّق", async () => {
    const manager = await actor([Role.CIRCLE_MANAGER]);
    const teacher = await actor([Role.TEACHER]);
    expect((await pendingGET(get("http://t/api/admin/pending-count", manager.jwt))).status).toBe(200);
    expect((await pendingGET(get("http://t/api/admin/pending-count", teacher.jwt))).status).toBe(403);
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
    return submitApplication(
      await buildApplicationInput(prisma, {
        nameAsInId: "متقدّم",
        nationalId: "1012345678",
        birthDate: new Date("2010-01-01"),
        guardianPhone: "0555000123",
      }),
    );
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
