import { ApprovalKind, ApprovalStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decide, propose } from "../approval";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../../test/helpers";
import { createUser } from "../../test/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("محرّك الاعتمادات (§٣٫٤)", () => {
  it("الاقتراح يُنشئ اعتمادًا PENDING ويُصدِر حدثًا", async () => {
    const registrar = await createUser(prisma);
    const a = await propose(prisma, {
      kind: ApprovalKind.PLACEMENT_DECISION,
      subjectType: "Student",
      subjectId: "s1",
      proposedBy: registrar.id,
    });
    expect(a.status).toBe(ApprovalStatus.PENDING);
    expect(await prisma.event.count({ where: { type: "APPROVAL_PROPOSED" } })).toBe(1);
  });

  it("الرفض بلا سبب ← يُرفض (§٣٫٤: مرفوض بسبب)", async () => {
    const u = await createUser(prisma);
    const a = await propose(prisma, {
      kind: ApprovalKind.ABSENCE_EXCUSE,
      subjectType: "Attendance",
      subjectId: "att1",
      proposedBy: u.id,
    });
    await expect(
      decide(prisma, { approvalId: a.id, decidedBy: u.id, decision: "REJECTED" }),
    ).rejects.toBeInstanceOf(ValidationError);
    // بقي معلّقًا — لم يتغيّر.
    const after = await prisma.approval.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.status).toBe(ApprovalStatus.PENDING);
  });

  it("الاعتماد ← APPROVED + حدث، ولا يُحسم مرتين", async () => {
    const u = await createUser(prisma);
    const a = await propose(prisma, {
      kind: ApprovalKind.TRACK_PROMOTION,
      subjectType: "TrackAssignment",
      subjectId: "t1",
      proposedBy: u.id,
    });
    const decided = await decide(prisma, {
      approvalId: a.id,
      decidedBy: u.id,
      decision: "APPROVED",
    });
    expect(decided.status).toBe(ApprovalStatus.APPROVED);
    expect(await prisma.event.count({ where: { type: "APPROVAL_DECIDED" } })).toBe(1);

    await expect(
      decide(prisma, { approvalId: a.id, decidedBy: u.id, decision: "APPROVED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
