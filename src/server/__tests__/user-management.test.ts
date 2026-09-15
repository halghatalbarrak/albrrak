import { ActivationPurpose, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeActivation,
  createStaff,
  getActivationStatus,
  listUsers,
  resetPassword,
  setActive,
  setRoles,
} from "../user-management";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { fakeAuthProvider } from "../testing/auth";
import { createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const tech = () => createUser(prisma, { roles: [Role.TECH_ADMIN] });
const superAdmin = () => createUser(prisma, { roles: [Role.SUPER_ADMIN] });

describe("إدارة المستخدمين — الوصول للمشرف/المدير التقنيّ فقط", () => {
  it("فاعلٌ بلا صلاحية (معلّم) ← يُرفض في كلّ عمليّة", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(listUsers(teacher.id, prisma)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      createStaff(teacher.id, { name: "س", phone: "0555000111", roles: [Role.TEACHER] }, prisma, fakeAuthProvider),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("المدير التقنيّ يسرد كلّ المستخدمين مع علم «طالب؟»", async () => {
    const t = await tech();
    const rows = await listUsers(t.id, prisma);
    expect(rows.some((r) => r.id === t.id && r.roles.includes(Role.TECH_ADMIN))).toBe(true);
  });
});

describe("إضافة كادر", () => {
  it("المدير التقنيّ ينشئ كادراً ← حساب + authId + رابط تفعيل ACTIVATE", async () => {
    const t = await tech();
    const res = await createStaff(
      t.id, { name: "معلّمٌ جديد", phone: "0555000222", roles: [Role.TEACHER] }, prisma, fakeAuthProvider,
    );
    expect(res.activationUrl).toContain("/activate?token=");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.authId).toBeTruthy();
    expect(user.roles).toEqual([Role.TEACHER]);
    const link = await prisma.activationLink.findFirstOrThrow({ where: { userId: res.userId } });
    expect(link.purpose).toBe(ActivationPurpose.ACTIVATE);
    expect(link.usedAt).toBeNull();
  });

  it("جوالٌ مكرّرٌ ← يُرفض", async () => {
    const t = await tech();
    await createStaff(t.id, { name: "أ", phone: "0555000333", roles: [Role.TEACHER] }, prisma, fakeAuthProvider);
    await expect(
      createStaff(t.id, { name: "ب", phone: "0555000333", roles: [Role.RECITER] }, prisma, fakeAuthProvider),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("مشرفٌ عامّ لا ينشئ مديراً تقنيّاً (أعلى من دوره) ← يُرفض", async () => {
    const s = await superAdmin();
    await expect(
      createStaff(s.id, { name: "ج", phone: "0555000444", roles: [Role.TECH_ADMIN] }, prisma, fakeAuthProvider),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("تعطيل/تفعيل", () => {
  it("لا يعطّل الفاعل نفسه ← يُرفض", async () => {
    const t = await tech();
    await expect(setActive(t.id, t.id, false, prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("لا يُعطَّل آخر مدير تقنيّ فعّال ← يُرفض", async () => {
    const t = await tech();          // الوحيد التقنيّ
    const s = await superAdmin();    // يملك إدارة المستخدمين
    await expect(setActive(s.id, t.id, false, prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("تعطيل كادرٍ عاديّ ← ينجح", async () => {
    const t = await tech();
    const staff = await createUser(prisma, { roles: [Role.TEACHER] });
    const res = await setActive(t.id, staff.id, false, prisma);
    expect(res.isActive).toBe(false);
  });
});

describe("تعديل الأدوار — الحُرّاس الصارمة", () => {
  it("لا يعدّل الفاعل أدوار نفسه ← يُرفض", async () => {
    const t = await tech();
    await expect(setRoles(t.id, t.id, [Role.TECH_ADMIN, Role.CIRCLE_MANAGER], prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("لا يمنح دوراً أعلى من دوره (مشرفٌ يمنح TECH_ADMIN) ← يُرفض", async () => {
    const s = await superAdmin();
    const staff = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(setRoles(s.id, staff.id, [Role.TECH_ADMIN], prisma)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا يُنزع آخر مدير تقنيّ فعّال ← يُرفض", async () => {
    const t = await tech();          // الوحيد التقنيّ (هدف)
    const s = await superAdmin();    // فاعل
    await expect(setRoles(s.id, t.id, [Role.SUPER_ADMIN], prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("ترقيةٌ مسموحة (تقنيٌّ يرقّي معلّماً إلى مدير حلقات) ← تنجح", async () => {
    const t = await tech();
    const staff = await createUser(prisma, { roles: [Role.TEACHER] });
    const res = await setRoles(t.id, staff.id, [Role.CIRCLE_MANAGER], prisma);
    expect(res.roles).toEqual([Role.CIRCLE_MANAGER]);
  });
});

describe("إعادة تعيين كلمة السرّ + التفعيل العامّ", () => {
  it("إعادة التعيين تولّد رابط RESET؛ ومن بلا حساب دخول ← يُرفض", async () => {
    const t = await tech();
    const staff = await createStaff(t.id, { name: "د", phone: "0555000555", roles: [Role.TEACHER] }, prisma, fakeAuthProvider);
    const r = await resetPassword(t.id, staff.userId, prisma);
    expect(r.activationUrl).toContain("/activate?token=");

    const noLogin = await createUser(prisma, { roles: [Role.TEACHER], authId: null });
    await expect(resetPassword(t.id, noLogin.id, prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("رابطٌ صالح ← يضبط كلمة السرّ ويصير مستعمَلاً؛ وإعادة استعماله ← تُرفض", async () => {
    const t = await tech();
    const staff = await createStaff(t.id, { name: "هـ", phone: "0555000666", roles: [Role.TEACHER] }, prisma, fakeAuthProvider);
    const token = new URL(staff.activationUrl).searchParams.get("token")!;

    expect((await getActivationStatus(token, prisma)).purpose).toBe(ActivationPurpose.ACTIVATE);
    await completeActivation(token, "password123", prisma, fakeAuthProvider);

    const link = await prisma.activationLink.findFirstOrThrow({ where: { token } });
    expect(link.usedAt).not.toBeNull();
    await expect(completeActivation(token, "password123", prisma, fakeAuthProvider)).rejects.toBeInstanceOf(ValidationError);
    await expect(getActivationStatus(token, prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("كلمة سرٍّ قصيرة ← تُرفض", async () => {
    const t = await tech();
    const staff = await createStaff(t.id, { name: "و", phone: "0555000777", roles: [Role.TEACHER] }, prisma, fakeAuthProvider);
    const token = new URL(staff.activationUrl).searchParams.get("token")!;
    await expect(completeActivation(token, "short", prisma, fakeAuthProvider)).rejects.toBeInstanceOf(ValidationError);
  });

  it("رابطٌ منتهٍ ← يُرفض", async () => {
    const staff = await createUser(prisma, { roles: [Role.TEACHER] });
    const token = "expired-token-abc";
    await prisma.activationLink.create({
      data: { userId: staff.id, token, purpose: ActivationPurpose.ACTIVATE, expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(getActivationStatus(token, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});
