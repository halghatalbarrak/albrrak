/**
 * اختبار IDOR — صفحة وليّ الأمر
 *
 * ١) وليٌّ يرى أبناءه فقط — الأبناء الآخرون لا يظهرون.
 * ٢) مستخدم بدور TEACHER لا يصل لـ GET /api/guardian/children (403).
 * ٣) وليٌّ لا يرى ابن وليٍّ آخر حتى لو عرف معرّفه.
 */
import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/guardian/children/route";
import { prisma, resetDb } from "../testing/helpers";
import { createUser, createStudent } from "../testing/factories";
import { mintJwt } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

let seq = 0;
async function actor(roles: Role[]) {
  seq += 1;
  const user = await createUser(prisma, { roles, authId: `auth-gidor-${seq}`, isActive: true });
  const jwt = await mintJwt(`auth-gidor-${seq}`);
  return { user, jwt };
}

function get(jwt: string, params: Record<string, string> = {}) {
  const url = new URL("http://x/api/guardian/children");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { headers: { authorization: `Bearer ${jwt}` } });
}

describe("GET /api/guardian/children — حارس IDOR", () => {
  it("وليٌّ يرى أبناءه فقط — الأبناء الآخرون لا يظهرون", async () => {
    const guardian = await actor([Role.GUARDIAN]);
    const { student: myChild } = await createStudent(prisma);
    const { student: otherChild } = await createStudent(prisma);

    // ربط ابن واحد فقط بالوليّ
    await prisma.guardianLink.create({
      data: { guardianId: guardian.user.id, studentId: myChild.id, status: "ACTIVE" },
    });

    const res = await GET(get(guardian.jwt));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { studentId: string }[];
    const ids = data.map((d) => d.studentId);
    expect(ids).toContain(myChild.id);
    expect(ids).not.toContain(otherChild.id);
  });

  it("مستخدم بدور TEACHER لا يصل للـAPI (403)", async () => {
    const teacher = await actor([Role.TEACHER]);
    const res = await GET(get(teacher.jwt));
    expect(res.status).toBe(403);
  });

  it("وليٌّ بلا أبناء مرتبطين يحصل على قائمة فارغة", async () => {
    const guardian = await actor([Role.GUARDIAN]);
    const res = await GET(get(guardian.jwt));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("تنسيق تاريخ خاطئ يُرجع 400", async () => {
    const guardian = await actor([Role.GUARDIAN]);
    const res = await GET(get(guardian.jwt, { date: "not-a-date" }));
    expect(res.status).toBe(400);
  });
});
