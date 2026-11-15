/**
 * اختبارات الحذف الناعم — P4 (سلة المحذوفات)
 * يتحقّق من: بصمة deletedAt + قيد AuditLog + استبعاد المحذوف من القوائم + رفض الحذف المكرَّر.
 */
import {
  ApplicationStatus,
  DisplayScreenKind,
  Gender,
  PointGrantSource,
  PointLimitPeriod,
  ProgramKey,
  Role,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { softDeleteScreen, listScreens } from "../display/screens";
import { softDeleteSchedule, listSchedules, addSchedule } from "../display/schedules";
import { softDeletePointItem, listPointItems, createPointItem } from "../economy";
import { softDeleteMarketItem, listMarketItems, createMarketItem } from "../market";
import { softDeleteApplication, listApplicationsForReview } from "../application";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser, createProgram } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══ شاشة (DisplayScreen) ═══════════════════════════════════════════════
describe("softDeleteScreen", () => {
  it("يضع deletedAt ويكتب AuditLog ويحذف من القائمة", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const { id } = await prisma.displayScreen.create({ data: { kind: DisplayScreenKind.MOSQUE, nameAr: "شاشة المسجد" } });

    await softDeleteScreen(actor.id, id, prisma);

    const row = await prisma.displayScreen.findUnique({ where: { id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedById).toBe(actor.id);

    const log = await prisma.auditLog.findFirst({ where: { entity: "DisplayScreen", entityId: id } });
    expect(log?.action).toBe("DELETE");

    const list = await listScreens(prisma);
    expect(list.find((s) => s.id === id)).toBeUndefined();
  });

  it("يرفض حذف شاشةٍ محذوفة", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const { id } = await prisma.displayScreen.create({ data: { kind: DisplayScreenKind.MOSQUE, nameAr: "شاشة ٢" } });
    await softDeleteScreen(actor.id, id, prisma);
    await expect(softDeleteScreen(actor.id, id, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══ موعد الشاشة (DisplaySchedule) ═══════════════════════════════════════
describe("softDeleteSchedule", () => {
  it("يضع deletedAt ويحذف من القائمة", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const prog = await createProgram(prisma, ProgramKey.MARAQI);
    const { id: screenId } = await prisma.displayScreen.create({ data: { kind: DisplayScreenKind.MOSQUE, nameAr: "ش" } });
    const { id: schedId } = await addSchedule(actor.id, screenId, {
      startMode: "PRAYER" as never, prayer: "ASR" as never, rel: "AFTER" as never, offsetMin: 10,
      durationMin: 30, contentMode: "PROGRAM" as never, programId: prog.id,
    }, prisma);

    await softDeleteSchedule(actor.id, schedId, prisma);

    const row = await prisma.displaySchedule.findUnique({ where: { id: schedId } });
    expect(row?.deletedAt).not.toBeNull();

    const list = await listSchedules(screenId, prisma);
    expect(list.find((s) => s.id === schedId)).toBeUndefined();
  });

  it("يرفض حذف موعدٍ محذوف", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const prog = await createProgram(prisma, ProgramKey.MARAQI);
    const { id: screenId } = await prisma.displayScreen.create({ data: { kind: DisplayScreenKind.MOSQUE, nameAr: "ش٢" } });
    const { id: schedId } = await addSchedule(actor.id, screenId, {
      startMode: "PRAYER" as never, prayer: "FAJR" as never, rel: "AFTER" as never, offsetMin: 5,
      durationMin: 20, contentMode: "PROGRAM" as never, programId: prog.id,
    }, prisma);
    await softDeleteSchedule(actor.id, schedId, prisma);
    await expect(softDeleteSchedule(actor.id, schedId, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══ بند النقاط (PointItem) ═══════════════════════════════════════════════
describe("softDeletePointItem", () => {
  it("يضع deletedAt ويكتب AuditLog ويحذف من القائمة", async () => {
    const actor = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const item = await createPointItem(actor.id, { nameAr: "بند حضور", value: 5, grantSource: PointGrantSource.ADMIN, limitPeriod: PointLimitPeriod.NONE }, prisma);

    await softDeletePointItem(actor.id, item.id, prisma);

    const row = await prisma.pointItem.findUnique({ where: { id: item.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedById).toBe(actor.id);

    const log = await prisma.auditLog.findFirst({ where: { entity: "PointItem", entityId: item.id } });
    expect(log?.action).toBe("DELETE");

    const list = await listPointItems(actor.id, prisma);
    expect(list.find((i) => i.id === item.id)).toBeUndefined();
  });

  it("يرفض حذف بندٍ محذوف", async () => {
    const actor = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const item = await createPointItem(actor.id, { nameAr: "بند ٢", value: 10, grantSource: PointGrantSource.ADMIN, limitPeriod: PointLimitPeriod.NONE }, prisma);
    await softDeletePointItem(actor.id, item.id, prisma);
    await expect(softDeletePointItem(actor.id, item.id, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══ ثمرة السوق (MarketItem) ═══════════════════════════════════════════════
describe("softDeleteMarketItem", () => {
  it("يضع deletedAt ويكتب AuditLog ويحذف من القائمة", async () => {
    const actor = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const item = await createMarketItem(actor.id, { nameAr: "ثمرة ١", pricePoints: 50 }, prisma);

    await softDeleteMarketItem(actor.id, item.id, prisma);

    const row = await prisma.marketItem.findUnique({ where: { id: item.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedById).toBe(actor.id);

    const log = await prisma.auditLog.findFirst({ where: { entity: "MarketItem", entityId: item.id } });
    expect(log?.action).toBe("DELETE");

    const list = await listMarketItems(actor.id, prisma);
    expect(list.find((i) => i.id === item.id)).toBeUndefined();
  });

  it("يرفض حذف ثمرةٍ محذوفة", async () => {
    const actor = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const item = await createMarketItem(actor.id, { nameAr: "ثمرة ٢", pricePoints: 20 }, prisma);
    await softDeleteMarketItem(actor.id, item.id, prisma);
    await expect(softDeleteMarketItem(actor.id, item.id, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══ طلب القيد (Application) ═══════════════════════════════════════════════
describe("softDeleteApplication", () => {
  async function makeApp() {
    return prisma.application.create({
      data: {
        nameAsInId: "أحمد",
        nationalIdEnc: "enc123",
        nationalityId: (await prisma.nationality.findFirst())?.id ?? (await prisma.nationality.create({ data: { nameAr: "سعودي" } })).id,
        birthDate: new Date("2010-01-01"),
        gender: Gender.MALE,
        guardianPhone: "+966500000001",
        guardianGender: Gender.MALE,
        guardianRelationId: (await prisma.guardianRelation.findFirst())?.id ?? (await prisma.guardianRelation.create({ data: { nameAr: "أب" } })).id,
        emergencyName: "وليّ أمر",
        emergencyPhone: "+966500000002",
        emergencyRelationId: (await prisma.guardianRelation.findFirst({ orderBy: { id: "desc" } }))?.id ?? (await prisma.guardianRelation.create({ data: { nameAr: "أب" } })).id,
        status: ApplicationStatus.PENDING,
      },
    });
  }

  it("يضع deletedAt ويكتب AuditLog ويحذف من قائمة المراجعة", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const app = await makeApp();

    await softDeleteApplication(actor.id, app.id, prisma);

    const row = await prisma.application.findUnique({ where: { id: app.id } });
    expect(row?.deletedAt).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { entity: "Application", entityId: app.id } });
    expect(log?.action).toBe("DELETE");

    const list = await listApplicationsForReview(prisma);
    expect(list.find((a) => a.id === app.id)).toBeUndefined();
  });

  it("يرفض حذف طلبٍ محذوف", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const app = await makeApp();
    await softDeleteApplication(actor.id, app.id, prisma);
    await expect(softDeleteApplication(actor.id, app.id, prisma)).rejects.toBeInstanceOf(ValidationError);
  });

  it("يرفض حذف طلبٍ مقبول (ACCEPTED)", async () => {
    const actor = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const app = await makeApp();
    await prisma.application.update({ where: { id: app.id }, data: { status: ApplicationStatus.ACCEPTED } });
    await expect(softDeleteApplication(actor.id, app.id, prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});
