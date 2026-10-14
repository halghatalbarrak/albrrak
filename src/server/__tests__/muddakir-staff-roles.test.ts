import { MuddakirRequestStatus, MuddakirStaffRole, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { setMuddakirStaffRoles, decideRequest } from "../muddakir-requests";
import { assignStaff, activeStaffRoles } from "../muddakir-staff";
import { setRoles, setRolesAndStaff } from "../user-management";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// و١: تعيين طاقم المدّكر من نافذة الأدوار عبر setMuddakirStaffRoles — التخزين في MuddakirStaff.

describe("طاقم المدّكر من نافذة الأدوار (و١)", () => {
  it("مدير المنصّة يعيّن مدير برنامج ⟵ يُطبَّق فوراً وتظهر الشارة", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const target = await createUser(prisma, { roles: [] });
    const res = await setMuddakirStaffRoles({ actorUserId: platform.id, targetUserId: target.id, desired: [MuddakirStaffRole.MANAGER] }, prisma);
    expect(res.applied).toEqual([MuddakirStaffRole.MANAGER]);
    expect(res.requested).toEqual([]);
    expect(await activeStaffRoles(prisma, target.id)).toContain(MuddakirStaffRole.MANAGER);
  });

  it("مدير البرنامج يعيّن مشرفاً، ولا يستطيع تعيين مدير برنامج", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const progMgr = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: progMgr.id, role: MuddakirStaffRole.MANAGER }, prisma);
    const target = await createUser(prisma, { roles: [] });

    const ok = await setMuddakirStaffRoles({ actorUserId: progMgr.id, targetUserId: target.id, desired: [MuddakirStaffRole.SUPERVISOR] }, prisma);
    expect(ok.applied).toEqual([MuddakirStaffRole.SUPERVISOR]);
    expect(await activeStaffRoles(prisma, target.id)).toContain(MuddakirStaffRole.SUPERVISOR);

    await expect(
      setMuddakirStaffRoles({ actorUserId: progMgr.id, targetUserId: target.id, desired: [MuddakirStaffRole.SUPERVISOR, MuddakirStaffRole.MANAGER] }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await activeStaffRoles(prisma, target.id)).not.toContain(MuddakirStaffRole.MANAGER);
  });

  it("الإداريّ: التعيين يُنشئ طلباً معلّقاً ولا يسري فوراً، ويسري عند اعتماد المدير", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const admin = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: admin.id, role: MuddakirStaffRole.ADMIN }, prisma);
    const target = await createUser(prisma, { roles: [] });

    const res = await setMuddakirStaffRoles({ actorUserId: admin.id, targetUserId: target.id, desired: [MuddakirStaffRole.SUPERVISOR] }, prisma);
    expect(res.requested).toEqual([MuddakirStaffRole.SUPERVISOR]);
    expect(res.applied).toEqual([]);
    expect(await activeStaffRoles(prisma, target.id)).not.toContain(MuddakirStaffRole.SUPERVISOR); // لم يسرِ
    const req = await prisma.muddakirAdminRequest.findFirstOrThrow({ where: { type: "SET_STAFF", status: MuddakirRequestStatus.PENDING } });

    // مدير المنصّة يعتمد الطلب ⟵ يسري.
    await decideRequest({ actorUserId: platform.id, requestId: req.id, decision: "APPROVED" }, prisma);
    expect(await activeStaffRoles(prisma, target.id)).toContain(MuddakirStaffRole.SUPERVISOR);
  });

  it("الإزالة إلغاءٌ بـendedAt لا حذف", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const target = await createUser(prisma, { roles: [] });
    await setMuddakirStaffRoles({ actorUserId: platform.id, targetUserId: target.id, desired: [MuddakirStaffRole.EXAMINER] }, prisma);
    await setMuddakirStaffRoles({ actorUserId: platform.id, targetUserId: target.id, desired: [] }, prisma); // إزالة
    expect(await activeStaffRoles(prisma, target.id)).not.toContain(MuddakirStaffRole.EXAMINER);
    const rows = await prisma.muddakirStaff.findMany({ where: { userId: target.id, role: MuddakirStaffRole.EXAMINER } });
    expect(rows).toHaveLength(1); // الصفّ باقٍ
    expect(rows[0].endedAt).not.toBeNull(); // مُلغًى لا محذوف
  });

  it("معلّمٌ بلا صلاحية لا يعدّل شيئاً ← الخادم يرفض", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const target = await createUser(prisma, { roles: [] });
    await expect(
      setMuddakirStaffRoles({ actorUserId: teacher.id, targetUserId: target.id, desired: [MuddakirStaffRole.SUPERVISOR] }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await activeStaffRoles(prisma, target.id)).toEqual([]);
  });
});

describe("إفراغ الأدوار العامّة مع وظيفة مدّكر (و١، العطل)", () => {
  it("يُحفظ مدير برنامج المدّكر بلا أيّ دورٍ عامّ (كانت كلّها تُرفَض)", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const target = await createUser(prisma, { roles: [Role.TEACHER] });
    await assignStaff({ actorUserId: platform.id, targetUserId: target.id, role: MuddakirStaffRole.MANAGER }, prisma);
    const updated = await setRoles(platform.id, target.id, [], prisma);
    expect(updated.roles).toEqual([]); // الحفظ نجح بلا دورٍ عامّ
  });

  it("يُرفض إفراغ الأدوار لمن لا دورَ ولا وظيفة له (دورٌ واحدٌ على الأقلّ من النوعين)", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const target = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(setRoles(platform.id, target.id, [], prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("حصر وظائف المدّكر: وظيفةٌ واحدةٌ بلا دورٍ عامّ (و١)", () => {
  it("مشرف المدّكر لا يُمنح دور معلّم", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const sup = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: sup.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    await expect(setRoles(platform.id, sup.id, [Role.TEACHER], prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("المعلّم لا يُمنح وظيفة مدّكر", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(
      setMuddakirStaffRoles({ actorUserId: platform.id, targetUserId: teacher.id, desired: [MuddakirStaffRole.SUPERVISOR] }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await activeStaffRoles(prisma, teacher.id)).toEqual([]);
  });

  it("لا وظيفتان مدّكر لشخصٍ واحد", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const u = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: u.id, role: MuddakirStaffRole.SUPERVISOR }, prisma);
    await expect(
      setMuddakirStaffRoles({ actorUserId: platform.id, targetUserId: u.id, desired: [MuddakirStaffRole.SUPERVISOR, MuddakirStaffRole.EXAMINER] }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await activeStaffRoles(prisma, u.id)).toEqual([MuddakirStaffRole.SUPERVISOR]);
  });

  it("طلب SET_STAFF المخالف يُرفض عند الاعتماد (صار الهدف يحمل دوراً عامّاً)", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const admin = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: admin.id, role: MuddakirStaffRole.ADMIN }, prisma);
    const target = await createUser(prisma, { roles: [] }); // نظيفٌ وقت الطلب
    const res = await setMuddakirStaffRoles({ actorUserId: admin.id, targetUserId: target.id, desired: [MuddakirStaffRole.SUPERVISOR] }, prisma);
    expect(res.requested).toEqual([MuddakirStaffRole.SUPERVISOR]);
    const req = await prisma.muddakirAdminRequest.findFirstOrThrow({ where: { type: "SET_STAFF", status: "PENDING" } });
    await setRoles(platform.id, target.id, [Role.TEACHER], prisma); // صار يحمل دوراً عامّاً
    await expect(
      decideRequest({ actorUserId: platform.id, requestId: req.id, decision: "APPROVED" }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await activeStaffRoles(prisma, target.id)).not.toContain(MuddakirStaffRole.SUPERVISOR);
  });

  it("إجراء الإداريّ يصير طلباً معلّقاً (لا تنفيذٌ مباشر)", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const admin = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: admin.id, role: MuddakirStaffRole.ADMIN }, prisma);
    const target = await createUser(prisma, { roles: [] });
    const res = await setMuddakirStaffRoles({ actorUserId: admin.id, targetUserId: target.id, desired: [MuddakirStaffRole.SUPERVISOR] }, prisma);
    expect(res.applied).toEqual([]);
    expect(res.requested).toEqual([MuddakirStaffRole.SUPERVISOR]);
    expect(await activeStaffRoles(prisma, target.id)).toEqual([]); // لم يسرِ قبل الاعتماد
  });
});

describe("setRolesAndStaff: الحفظ الموحّد الذرّيّ (و١)", () => {
  it("يحوّل معلّماً إلى موظّف مدّكرٍ (تصفير العامّ + إسناد الوظيفة)", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const u = await createUser(prisma, { roles: [Role.TEACHER] });
    const r = await setRolesAndStaff(platform.id, u.id, [], [MuddakirStaffRole.MANAGER], prisma);
    expect(r.roles).toEqual([]);
    expect(await activeStaffRoles(prisma, u.id)).toEqual([MuddakirStaffRole.MANAGER]);
  });

  it("يعيد موظّف المدّكر إلى دورٍ عامّ (إنهاء الوظيفة + ضبط الدور)", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const u = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: u.id, role: MuddakirStaffRole.MANAGER }, prisma);
    const r = await setRolesAndStaff(platform.id, u.id, [Role.TEACHER], [], prisma);
    expect(r.roles).toEqual([Role.TEACHER]);
    expect(await activeStaffRoles(prisma, u.id)).toEqual([]);
  });

  it("يرفض الجمع (دورٌ عامّ + وظيفة) والفراغ التامّ", async () => {
    const platform = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const u = await createUser(prisma, { roles: [] });
    await expect(setRolesAndStaff(platform.id, u.id, [Role.TEACHER], [MuddakirStaffRole.MANAGER], prisma)).rejects.toBeInstanceOf(ValidationError);
    await expect(setRolesAndStaff(platform.id, u.id, [], [], prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});
