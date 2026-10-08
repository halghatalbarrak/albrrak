import { MuddakirRequestType, MuddakirStaffRole, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { assignStaff } from "../muddakir-staff";
import { createRequest, decideRequest, cancelRequest, listPendingRequests } from "../muddakir-requests";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// و٢ (§٢): طلبات الإداريّ — لا تغيير قبل الموافقة، تنفيذٌ مرّةً واحدة، رفضٌ بسبب، وإلغاءٌ للمعلّق.

async function setup() {
  await createProgram(prisma, ProgramKey.MUDDAKIR);
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  const platform = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  const mgr = await createUser(prisma, { roles: [] });
  await assignStaff({ actorUserId: platform.id, targetUserId: mgr.id, role: MuddakirStaffRole.MANAGER }, prisma);
  const admin = await createUser(prisma, { roles: [] });
  await assignStaff({ actorUserId: mgr.id, targetUserId: admin.id, role: MuddakirStaffRole.ADMIN }, prisma);
  return { student, platform, mgr, admin };
}

const hasProfile = async (studentId: string) => (await prisma.muddakirProfile.findUnique({ where: { studentId }, select: { studentId: true } })) != null;

describe("طلب الإلحاق — لا تغيير قبل الموافقة، وتنفيذٌ عند الموافقة", () => {
  it("إنشاء الطلب لا يُلحق؛ والموافقة تُلحق مرّةً واحدة", async () => {
    const { student, mgr, admin } = await setup();
    const r = await createRequest({ actorUserId: admin.id, type: MuddakirRequestType.ENROLL, payload: { studentId: student.id }, studentId: student.id }, prisma);
    expect(await hasProfile(student.id)).toBe(false); // لم يتغيّر شيء
    expect((await listPendingRequests(prisma)).map((x) => x.id)).toEqual([r.id]);

    const d = await decideRequest({ actorUserId: mgr.id, requestId: r.id, decision: "APPROVED" }, prisma);
    expect(d.status).toBe("APPROVED");
    expect(await hasProfile(student.id)).toBe(true); // نُفِّذ الإلحاق
    const row = await prisma.muddakirAdminRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.executedAt).not.toBeNull();

    // الموافقة ثانيةً مرفوضة (لا تنفيذ مرّتين).
    await expect(decideRequest({ actorUserId: mgr.id, requestId: r.id, decision: "APPROVED" }, prisma)).rejects.toThrow();
  });
});

describe("الرفض والإلغاء والصلاحيّة", () => {
  it("الرفض يتطلّب سبباً ولا يُنفّذ", async () => {
    const { student, mgr, admin } = await setup();
    const r = await createRequest({ actorUserId: admin.id, type: MuddakirRequestType.ENROLL, payload: { studentId: student.id }, studentId: student.id }, prisma);
    await expect(decideRequest({ actorUserId: mgr.id, requestId: r.id, decision: "REJECTED" }, prisma)).rejects.toThrow(); // بلا سبب
    const d = await decideRequest({ actorUserId: mgr.id, requestId: r.id, decision: "REJECTED", reason: "غير مؤهّل" }, prisma);
    expect(d.status).toBe("REJECTED");
    expect(await hasProfile(student.id)).toBe(false); // لم يُنفَّذ
    expect((await prisma.muddakirAdminRequest.findUniqueOrThrow({ where: { id: r.id } })).decisionReason).toBe("غير مؤهّل");
  });

  it("الإداريّ يلغي طلبه المعلّق؛ ولا يبتّه؛ والبتّ لغير المدير مرفوض", async () => {
    const { student, admin } = await setup();
    const r = await createRequest({ actorUserId: admin.id, type: MuddakirRequestType.ENROLL, payload: { studentId: student.id }, studentId: student.id }, prisma);
    // الإداريّ لا يبتّ طلبه.
    await expect(decideRequest({ actorUserId: admin.id, requestId: r.id, decision: "APPROVED" }, prisma)).rejects.toThrow();
    // يلغيه.
    expect((await cancelRequest({ actorUserId: admin.id, requestId: r.id }, prisma)).cancelled).toBe(true);
    expect((await prisma.muddakirAdminRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED");
    // البتّ بعد الإلغاء مرفوض.
    const mgr = (await prisma.muddakirStaff.findFirstOrThrow({ where: { role: MuddakirStaffRole.MANAGER } })).userId;
    await expect(decideRequest({ actorUserId: mgr, requestId: r.id, decision: "APPROVED" }, prisma)).rejects.toThrow();
  });

  it("طلب إسناد المشرف يُنفَّذ بالموافقة", async () => {
    const { student, platform, mgr, admin } = await setup();
    // ألحِق أوّلاً (مباشرةً عبر طلبٍ موافَق).
    const e = await createRequest({ actorUserId: admin.id, type: MuddakirRequestType.ENROLL, payload: { studentId: student.id }, studentId: student.id }, prisma);
    await decideRequest({ actorUserId: mgr.id, requestId: e.id, decision: "APPROVED" }, prisma);
    const sup = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: sup.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    const r = await createRequest({ actorUserId: admin.id, type: MuddakirRequestType.ASSIGN_SUPERVISOR, payload: { studentId: student.id, supervisorId: sup.id }, studentId: student.id }, prisma);
    expect(await prisma.muddakirSupervision.count({ where: { studentId: student.id, endedAt: null } })).toBe(0); // لا إسناد قبل الموافقة
    await decideRequest({ actorUserId: mgr.id, requestId: r.id, decision: "APPROVED" }, prisma);
    expect(await prisma.muddakirSupervision.count({ where: { studentId: student.id, supervisorId: sup.id, endedAt: null } })).toBe(1);
  });
});
