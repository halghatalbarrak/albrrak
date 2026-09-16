import { AutoEventType, PointGrantSource, PointLimitPeriod, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPointItem,
  getBalance,
  getStudentLedger,
  grantAuto,
  listPointItems,
  setPointItemActive,
  updatePointItem,
} from "../economy";
import { recordSession } from "../attendance";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة: برنامج + حلقة + معلّمها + طالبٌ منتسبٌ + مدير (كسقّالة اختبار م٦أ).
async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, program.id);
  const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
  await prisma.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id } });
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { program, circle, teacher, student, manager };
}

/** ينشئ بند AUTO مربوطًا بحدثٍ (م٦أ-٢). */
async function createAutoItem(
  managerId: string,
  eventType: AutoEventType,
  value = 5,
  extra: { limitPeriod?: PointLimitPeriod; limitCount?: number } = {},
) {
  return createPointItem(managerId, {
    nameAr: `تلقائيّ-${eventType}`,
    value,
    grantSource: PointGrantSource.AUTO,
    eventType,
    ...extra,
  });
}

describe("إدارة قواعد الربط التلقائيّ (م٦أ-٢) — بند AUTO ↔ حدث", () => {
  it("بند AUTO بلا نوع حدثٍ ← يُرفض", async () => {
    const { manager } = await scaffold();
    await expect(
      createPointItem(manager.id, { nameAr: "تلقائيّ", value: 5, grantSource: PointGrantSource.AUTO }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("إنشاء بند AUTO يربطه بالحدث؛ والقائمة تُظهر نوعه", async () => {
    const { manager } = await scaffold();
    const item = await createAutoItem(manager.id, AutoEventType.ATTENDANCE);
    const listed = (await listPointItems(manager.id, prisma)).find((i) => i.id === item.id);
    expect(listed?.eventType).toBe(AutoEventType.ATTENDANCE);
  });

  it("حدثٌ واحدٌ لبندٍ مفعّلٍ واحد: ربطُ الحدث نفسِه ببندٍ ثانٍ مفعَّل ← يُرفض", async () => {
    const { manager } = await scaffold();
    await createAutoItem(manager.id, AutoEventType.DAILY_HARVEST);
    await expect(createAutoItem(manager.id, AutoEventType.DAILY_HARVEST)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("بعد تعطيل البند الأوّل يجوز ربط الحدث ببندٍ آخر", async () => {
    const { manager } = await scaffold();
    const first = await createAutoItem(manager.id, AutoEventType.PROMOTION);
    await setPointItemActive(manager.id, first.id, false, prisma);
    await expect(createAutoItem(manager.id, AutoEventType.PROMOTION)).resolves.toBeTruthy();
  });

  it("تحويل بندٍ من AUTO إلى مصدرٍ يدويّ يفكّ ربطه بالحدث", async () => {
    const { manager, student } = await scaffold();
    const item = await createAutoItem(manager.id, AutoEventType.STAGE_EXAM_PASS);
    await updatePointItem(manager.id, item.id, {
      nameAr: "صار يدويًّا",
      value: 5,
      grantSource: PointGrantSource.TEACHER,
    });
    const listed = (await listPointItems(manager.id, prisma)).find((i) => i.id === item.id);
    expect(listed?.eventType).toBeNull();
    // ولا يمنح الحدث بعد فكّ الربط.
    expect(await grantAuto(prisma, AutoEventType.STAGE_EXAM_PASS, student.id, "x")).toBeNull();
  });
});

describe("grantAuto — القواعد المطلقة (اختبارات الرفض/الصحّة)", () => {
  it("يمنح البند المربوط مرّةً؛ grantSource=AUTO وبلا مانحٍ بشريّ", async () => {
    const { manager, student } = await scaffold();
    await createAutoItem(manager.id, AutoEventType.ATTENDANCE, 5);
    const txn = await grantAuto(prisma, AutoEventType.ATTENDANCE, student.id, "2026-05-11");
    expect(txn).toBeTruthy();
    expect(await getBalance(student.id, prisma)).toBe(5);
    const ledger = await getStudentLedger(student.id, prisma);
    expect(ledger.transactions[0].grantSource).toBe(PointGrantSource.AUTO);
    expect(ledger.transactions[0].grantedByName).toBeNull();
  });

  it("منع الازدواج: نفس (الحدث + المرجع + الطالب) مرّتين ← منحٌ واحد", async () => {
    const { manager, student } = await scaffold();
    await createAutoItem(manager.id, AutoEventType.DAILY_HARVEST, 3);
    await grantAuto(prisma, AutoEventType.DAILY_HARVEST, student.id, "hasad-1");
    const second = await grantAuto(prisma, AutoEventType.DAILY_HARVEST, student.id, "hasad-1");
    expect(second).toBeNull();
    expect(await getBalance(student.id, prisma)).toBe(3);
  });

  it("مرجعان مختلفان ← منحان (حدثان فعليّان مختلفان)", async () => {
    const { manager, student } = await scaffold();
    await createAutoItem(manager.id, AutoEventType.DAILY_HARVEST, 3);
    await grantAuto(prisma, AutoEventType.DAILY_HARVEST, student.id, "hasad-1");
    await grantAuto(prisma, AutoEventType.DAILY_HARVEST, student.id, "hasad-2");
    expect(await getBalance(student.id, prisma)).toBe(6);
  });

  it("لا قاعدةَ للحدث ← لا منح", async () => {
    const { student } = await scaffold();
    expect(await grantAuto(prisma, AutoEventType.PROMOTION, student.id, "ref")).toBeNull();
    expect(await getBalance(student.id, prisma)).toBe(0);
  });

  it("البند/القاعدة معطَّلة ← لا منح", async () => {
    const { manager, student } = await scaffold();
    const item = await createAutoItem(manager.id, AutoEventType.HIZB_EXAM_PASS, 4);
    await setPointItemActive(manager.id, item.id, false, prisma);
    expect(await grantAuto(prisma, AutoEventType.HIZB_EXAM_PASS, student.id, "hizb-1")).toBeNull();
    expect(await getBalance(student.id, prisma)).toBe(0);
  });

  it("يحترم حدّ البند وفترته كالمنح اليدويّ", async () => {
    const { manager, student } = await scaffold();
    await createAutoItem(manager.id, AutoEventType.ATTENDANCE, 2, {
      limitPeriod: PointLimitPeriod.DAY,
      limitCount: 1,
    });
    await grantAuto(prisma, AutoEventType.ATTENDANCE, student.id, "day-1");
    const blocked = await grantAuto(prisma, AutoEventType.ATTENDANCE, student.id, "day-2");
    expect(blocked).toBeNull(); // بلغ الحدّ (مرّة/يوم)
    expect(await getBalance(student.id, prisma)).toBe(2);
  });
});

describe("الربط بالمحرّك — الحضور (لا أثر رجعيّ + لا ازدواج)", () => {
  it("حضورٌ سُجِّل قبل تفعيل القاعدة لا يُمنح؛ والحضور الجديد يُمنح مرّةً ولو أُعيد الرصد", async () => {
    const { manager, circle, teacher, student } = await scaffold();

    // (١) رصدٌ سابقٌ على وجود أيّ قاعدة — لا أثر رجعيّ.
    await recordSession({ circleId: circle.id, date: "2026-05-11", exceptions: [], recorderId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(0);

    // (٢) الإدارة تفعّل بند حضورٍ تلقائيّ.
    await createAutoItem(manager.id, AutoEventType.ATTENDANCE, 5);

    // (٣) رصدٌ جديدٌ ليومٍ آخر ← يُمنح؛ واليوم السابق يبقى بلا منح (لا رجعيّة).
    await recordSession({ circleId: circle.id, date: "2026-05-12", exceptions: [], recorderId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(5);

    // (٤) إعادة رصد اليوم نفسِه ← لا منحَ مضاعف (منع الازدواج بمفتاح اليوم).
    await recordSession({ circleId: circle.id, date: "2026-05-12", exceptions: [], recorderId: teacher.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(5);
  });
});
