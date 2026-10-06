import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildEvent, type BuildDeps } from "@/lib/muddakir";
import { ingestEvents } from "../muddakir-events";
import { getDayStatus } from "../muddakir-day";
import { enrollInMuddakir } from "../muddakir-enrollment";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const D = "2026-05-10";
const nowAfterMidnight = new Date(`${"2026-05-11"}T06:00:00.000Z`);

async function scaffold() {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  await prisma.setting.createMany({ data: Object.entries({ newReps: 5, firstCleanReps: 3, tracks: [1, 2, 3] }).map(([key, value]) => ({ programId: mud.id, key, value: value as never })) });
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  return { student, user };
}

describe("الإتمام المضغوط قبل منتصف الليل يُقبل ولو وصل بعده (client ⟵ server)", () => {
  it("حدثٌ يبنيه الجهاز بـoccurredAt قبل منتصف الليل يُقبل عند استقباله بعده", async () => {
    const { student, user } = await scaffold();
    // الجهاز يبني الحدث بوقت الضغط (٢٣:٥٩ بمكّة)، لكنّ الإرسال/الآن بعد منتصف الليل.
    const deps: BuildDeps = { uuid: () => "cmp-1", now: () => new Date(`${D}T20:59:00.000Z`) };
    const e = buildEvent("DAY_COMPLETE", null, deps);
    await ingestEvents({ actorUserId: user.id, events: [e] }, prisma, nowAfterMidnight);
    expect(await getDayStatus(prisma, student.id, D, nowAfterMidnight)).toBe("COMPLETE");
  });
});

describe("ERROR_OPEN — فتح موضع خطأ idempotent", () => {
  it("المكرّر لا يُنشئ موضعًا جديدًا، ولا موضعٌ آخر لنفس (الصفحة، السطر) المفتوح", async () => {
    const { student, user } = await scaffold();
    const open = (id: string) => ({ clientEventId: id, type: "ERROR_OPEN", occurredAt: `${D}T08:00:00.000Z`, payload: { page: 10, lineNo: 3, source: "RIBAT" } });
    await ingestEvents({ actorUserId: user.id, events: [open("err-1")] }, prisma, new Date(`${D}T12:00:00Z`));
    await ingestEvents({ actorUserId: user.id, events: [open("err-1")] }, prisma, new Date(`${D}T12:00:00Z`)); // مكرّر clientEventId
    await ingestEvents({ actorUserId: user.id, events: [open("err-2")] }, prisma, new Date(`${D}T12:00:00Z`)); // معرّفٌ آخر، نفس الموضع المفتوح
    expect(await prisma.muddakirError.count({ where: { studentId: student.id, page: 10, lineNo: 3 } })).toBe(1);
  });
});
