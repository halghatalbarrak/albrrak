import { AutoEventType, MuddakirRequestType, MuddakirStaffRole, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { assignStaff } from "../muddakir-staff";
import { createRequest, decideRequest } from "../muddakir-requests";
import { listMuddakirPointItems, listMuddakirSettings, listTathbitLadder, setMuddakirPointItem, setMuddakirSetting, setTathbitDegree } from "../muddakir-config";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// و٣ (§٩/§١٢): إعدادات التثبيت — السلّم، الإعدادات المحصورة، وبنود نقاط المدّكر وحدها.

// resetDb يفرّغ كلّ الجداول (ومنها الدرجات المزروعة بالترحيل)؛ فتزرعها الاختبارات بنفسها (كعادة
// اختبارات التثبيت الأخرى) بدل المساس بـresetDb المشترك.
const LADDER = [
  [1, 1, 30, 3], [2, 2, 15, 2], [3, 3, 10, 3], [4, 4, 8, 4], [5, 5, 6, 5],
  [6, 6, 5, 6], [7, 7, 5, 7], [8, 8, 4, 8], [9, 9, 4, 9], [10, 10, 3, 10],
] as const;
const seedLadder = () => prisma.muddakirTathbitDegree.createMany({ data: LADDER.map(([degreeNo, dailyJuz, khatmaDays, khatmaCount]) => ({ degreeNo, dailyJuz, khatmaDays, khatmaCount })) });

describe("سلّم التثبيت", () => {
  it("يعدّل درجةً قائمة؛ ويرفض درجةً غير موجودة أو قيمةً غير موجبة", async () => {
    await seedLadder();
    const u = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await setTathbitDegree(1, { dailyJuz: 3 }, u.id, prisma);
    expect((await listTathbitLadder(prisma)).find((d) => d.degreeNo === 1)?.dailyJuz).toBe(3);
    await expect(setTathbitDegree(999, { dailyJuz: 1 }, u.id, prisma)).rejects.toThrow();
    await expect(setTathbitDegree(1, { dailyJuz: 0 }, u.id, prisma)).rejects.toThrow();
  });
});

describe("الإعدادات المحصورة", () => {
  it("يضبط مفتاحاً مسموحاً فقط", async () => {
    await createProgram(prisma, ProgramKey.MUDDAKIR);
    const u = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    await setMuddakirSetting("weeklySurpriseJuz", 2, u.id, prisma);
    expect((await listMuddakirSettings(prisma)).weeklySurpriseJuz).toBe(2);
    await expect(setMuddakirSetting("notAllowedKey", 1, u.id, prisma)).rejects.toThrow();
  });
});

describe("بنود نقاط المدّكر وحدها", () => {
  it("يقبل حدث MUDDAKIR_* ويرفض سواه؛ ويظهر في القائمة", async () => {
    const u = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { id } = await setMuddakirPointItem({ nameAr: "إتمام يومٍ", value: 5, eventType: AutoEventType.MUDDAKIR_DAY_COMPLETE }, u.id, prisma);
    const rows = await listMuddakirPointItems(prisma);
    expect(rows.find((r) => r.id === id)?.value).toBe(5);
    // حدثٌ خارج المدّكر مرفوض.
    await expect(setMuddakirPointItem({ nameAr: "حضور", value: 1, eventType: AutoEventType.ATTENDANCE_PRESENT }, u.id, prisma)).rejects.toThrow();
    // حدثٌ واحدٌ لبندٍ مفعّلٍ واحد.
    await expect(setMuddakirPointItem({ nameAr: "آخر", value: 3, eventType: AutoEventType.MUDDAKIR_DAY_COMPLETE }, u.id, prisma)).rejects.toThrow();
  });
});

describe("تعديل السلّم عبر طلب الإداريّ (و٢+و٣)", () => {
  it("إنشاء الطلب لا يُغيّر السلّم؛ والموافقة تُغيّره", async () => {
    const platform = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const mgr = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: platform.id, targetUserId: mgr.id, role: MuddakirStaffRole.MANAGER }, prisma);
    const admin = await createUser(prisma, { roles: [] });
    await assignStaff({ actorUserId: mgr.id, targetUserId: admin.id, role: MuddakirStaffRole.ADMIN }, prisma);
    await seedLadder();

    const before = (await listTathbitLadder(prisma)).find((d) => d.degreeNo === 2)!.dailyJuz;
    const r = await createRequest({ actorUserId: admin.id, type: MuddakirRequestType.SET_TATHBIT_LADDER, payload: { degreeNo: 2, patch: { dailyJuz: before + 1 } } }, prisma);
    expect((await listTathbitLadder(prisma)).find((d) => d.degreeNo === 2)!.dailyJuz).toBe(before); // لم يتغيّر
    await decideRequest({ actorUserId: mgr.id, requestId: r.id, decision: "APPROVED" }, prisma);
    expect((await listTathbitLadder(prisma)).find((d) => d.degreeNo === 2)!.dailyJuz).toBe(before + 1);
  });
});
