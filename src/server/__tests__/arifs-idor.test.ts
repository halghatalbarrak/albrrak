import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as arifsGET } from "@/app/api/circles/[id]/arifs/route";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createUser } from "../testing/factories";
import { mintJwt } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

let seq = 0;
async function actor(roles: Role[]) {
  seq += 1;
  const user = await createUser(prisma, { roles, authId: `authsub-arifs-${seq}`, isActive: true });
  const jwt = await mintJwt(`authsub-arifs-${seq}`);
  return { user, jwt };
}

function get(url: string, jwt: string) {
  return new Request(url, { headers: { authorization: `Bearer ${jwt}` } });
}

describe("GET /api/circles/[id]/arifs — حارس IDOR", () => {
  it("المعلّم يرى عرفاء حلقته", async () => {
    const teacher = await actor([Role.TEACHER]);
    const circle = await createCircle(prisma);
    await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.user.id } });

    const res = await arifsGET(get(`http://x/api/circles/${circle.id}/arifs`, teacher.jwt), {
      params: Promise.resolve({ id: circle.id }),
    });
    expect(res.status).toBe(200);
  });

  it("المعلّم يُرفَض إن طلب حلقة غيره (403)", async () => {
    const teacherA = await actor([Role.TEACHER]);
    const teacherB = await actor([Role.TEACHER]);
    const circleB = await createCircle(prisma);
    await prisma.circleTeacher.create({ data: { circleId: circleB.id, teacherId: teacherB.user.id } });

    const res = await arifsGET(get(`http://x/api/circles/${circleB.id}/arifs`, teacherA.jwt), {
      params: Promise.resolve({ id: circleB.id }),
    });
    expect(res.status).toBe(403);
  });

  it("المدير يرى عرفاء أيّ حلقة", async () => {
    const manager = await actor([Role.CIRCLE_MANAGER]);
    const circle = await createCircle(prisma);

    const res = await arifsGET(get(`http://x/api/circles/${circle.id}/arifs`, manager.jwt), {
      params: Promise.resolve({ id: circle.id }),
    });
    expect(res.status).toBe(200);
  });
});
