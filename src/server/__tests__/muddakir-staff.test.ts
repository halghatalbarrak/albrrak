import { MuddakirStaffRole, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { assignStaff, endStaff, muddakirCaps, isSupervisorCapable, isExaminerCapable } from "../muddakir-staff";
import { assignSupervisor, enrollInMuddakir } from "../muddakir-enrollment";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// و١ (§٢): أدوار المدّكر المُحصَّرة — إسنادٌ خاصٌّ لا دورٌ عامّ، وسارّي المشرف/المختبِر يقبلان الخاصّ.

const caps = (userId: string, roles: Role[] = []) => muddakirCaps(prisma, { id: userId, roles });

async function muddakirStudent() {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  return { mud, student };
}

describe("التعيين والصلاحيّة (§٢)", () => {
  it("مدير المنصّة يعيّن MANAGER؛ ومدير البرنامج يعيّن الباقي لا MANAGER؛ والعاجز يُرفض", async () => {
    const platform = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const mgr = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: mgr.id, role: MuddakirStaffRole.MANAGER }, prisma);
    expect((await caps(mgr.id)).manage).toBe(true);

    const admin = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: mgr.id, targetUserId: admin.id, role: MuddakirStaffRole.ADMIN }, prisma); // مدير البرنامج يعيّن الإداريّ
    expect((await caps(admin.id)).admin).toBe(true);

    const x = await createUser(prisma, { roles: [] });
    await expect(assignStaff({ actorUserId: mgr.id, targetUserId: x.id, role: MuddakirStaffRole.MANAGER }, prisma)).rejects.toThrow(); // لا يعيّن MANAGER
    const plain = await createUser(prisma, { roles: [] });
    await expect(assignStaff({ actorUserId: plain.id, targetUserId: x.id, role: MuddakirStaffRole.ADMIN }, prisma)).rejects.toThrow(); // عاجزٌ عن التعيين
  });

  it("إسنادٌ idempotent، والإنهاء يُسقط الصلاحيّة بلا حذف", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const sup = await createUser(prisma, { roles: [] });
    const a = await assignStaff({ actorUserId: platform.id, targetUserId: sup.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    const b = await assignStaff({ actorUserId: platform.id, targetUserId: sup.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    expect(b.already).toBe(true);
    expect(b.id).toBe(a.id);
    expect(await isSupervisorCapable(prisma, sup.id)).toBe(true);
    await endStaff({ actorUserId: platform.id, targetUserId: sup.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    expect(await isSupervisorCapable(prisma, sup.id)).toBe(false);
    expect(await prisma.muddakirStaff.count({ where: { userId: sup.id } })).toBe(1); // بلا حذف (endedAt فقط)
  });
});

describe("الحصر في المدّكر (لا مراقي)", () => {
  it("دور المدّكر لا يمنح دوراً عامّاً في Role", async () => {
    const platform = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const mgr = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: mgr.id, role: MuddakirStaffRole.MANAGER }, prisma);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: mgr.id }, select: { roles: true } });
    expect(u.roles).toEqual([]); // لا دورَ عامّ
    // حرّاس مراقي/المنصّة دورِيّة ⟵ تردّه (ليس SUPER_ADMIN ولا CIRCLE_MANAGER).
    expect([Role.SUPER_ADMIN, Role.CIRCLE_MANAGER].some((r) => u.roles.includes(r))).toBe(false);
    // لكنّه يدير المدّكر.
    expect((await caps(mgr.id, u.roles)).manage).toBe(true);
  });
});

describe("سارّي المشرف والمختبِر يقبلان الدور الخاصّ", () => {
  it("SUPERVISOR الخاصّ يُقبل في إسناد الإشراف؛ وEXAMINER يملك سارّي المختبِر", async () => {
    const { student } = await muddakirStudent();
    const platform = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const sup = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: sup.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    const r = await assignSupervisor({ studentId: student.id, supervisorId: sup.id, actorId: platform.id }, prisma);
    expect(r.supervisionId).toBeTruthy(); // قُبل مشرفُ المدّكر الخاصّ (ليس ARIF)

    const exm = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: exm.id, role: MuddakirStaffRole.EXAMINER }, prisma);
    expect(await isExaminerCapable(prisma, exm.id)).toBe(true);

    const plain = await createUser(prisma, { roles: [] });
    expect(await isSupervisorCapable(prisma, plain.id)).toBe(false);
    expect(await isExaminerCapable(prisma, plain.id)).toBe(false);
    // ARIF/RECITER العامّان ما زالا مقبولَين.
    const arif = await createUser(prisma, { roles: [Role.ARIF] });
    const reciter = await createUser(prisma, { roles: [Role.RECITER] });
    expect(await isSupervisorCapable(prisma, arif.id)).toBe(true);
    expect(await isExaminerCapable(prisma, reciter.id)).toBe(true);
  });
});
