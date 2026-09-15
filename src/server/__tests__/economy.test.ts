import { PointGrantSource, PointLimitPeriod, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPointItem,
  getBalance,
  getStudentLedger,
  grantPoints,
  listGrantableItems,
  listGrantableStudents,
  listPointItems,
  setPointItemActive,
  updatePointItem,
} from "../economy";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة: برنامج + حلقة + معلّمها + طالبٌ منتسبٌ لها + مدير.
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

describe("إدارة بنود النقاط (م٦أ) — للإدارة وحدها، لا حذف", () => {
  it("المدير ينشئ بندًا؛ والقيمة الموجبة كسبٌ والسالبة خصم", async () => {
    const { manager } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "حضور مبكّر",
      value: 5,
      grantSource: PointGrantSource.TEACHER,
    });
    expect(item.value).toBe(5);
    expect(item.limitPeriod).toBe(PointLimitPeriod.NONE);
    const items = await listPointItems(manager.id, prisma);
    expect(items).toHaveLength(1);
  });

  it("غير الإدارة لا يُنشئ بندًا ← يُرفض في الخادم", async () => {
    const { teacher } = await scaffold();
    await expect(
      createPointItem(teacher.id, { nameAr: "بند", value: 3, grantSource: PointGrantSource.TEACHER }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("قيمة صفر تُرفض (لا كسب ولا خصم)", async () => {
    const { manager } = await scaffold();
    await expect(
      createPointItem(manager.id, { nameAr: "بند", value: 0, grantSource: PointGrantSource.ADMIN }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("مع تحديد فترة الحدّ، العدد صحيحٌ موجب — وإلا يُرفض", async () => {
    const { manager } = await scaffold();
    await expect(
      createPointItem(manager.id, {
        nameAr: "بند",
        value: 2,
        grantSource: PointGrantSource.TEACHER,
        limitPeriod: PointLimitPeriod.DAY,
        limitCount: 0,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("التعطيل لا حذف — والبند المعطَّل يبقى في القائمة", async () => {
    const { manager } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "بند",
      value: 1,
      grantSource: PointGrantSource.ADMIN,
    });
    const disabled = await setPointItemActive(manager.id, item.id, false, prisma);
    expect(disabled.active).toBe(false);
    expect(await listPointItems(manager.id, prisma)).toHaveLength(1);
  });
});

describe("المنح اليدويّ — القواعد المطلقة في الخادم (اختبارات الرفض)", () => {
  it("بندٌ معطَّل ← يُرفض", async () => {
    const { manager, teacher, student } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "بند",
      value: 5,
      grantSource: PointGrantSource.TEACHER,
    });
    await setPointItemActive(manager.id, item.id, false, prisma);
    await expect(
      grantPoints({ studentId: student.id, pointItemId: item.id, grantedBy: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("مصدرٌ لا يملكه المانح: معلّمٌ يمنح بندًا مصدره «إدارة» ← يُرفض", async () => {
    const { manager, teacher, student } = await scaffold();
    const adminItem = await createPointItem(manager.id, {
      nameAr: "بند إداريّ",
      value: 10,
      grantSource: PointGrantSource.ADMIN,
    });
    await expect(
      grantPoints({ studentId: student.id, pointItemId: adminItem.id, grantedBy: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("بند تلقائيّ (AUTO) لا يُمنح يدويًّا — ولا حتى من الإدارة (مؤجَّل لـم٦أ-٢)", async () => {
    const { manager, student } = await scaffold();
    const autoItem = await createPointItem(manager.id, {
      nameAr: "بند تلقائيّ",
      value: 2,
      grantSource: PointGrantSource.AUTO,
    });
    await expect(
      grantPoints({ studentId: student.id, pointItemId: autoItem.id, grantedBy: manager.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("معلّمٌ يمنح لغير طلابه ← يُرفض في الخادم (§٣٫٢)", async () => {
    const { manager, student } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "بند",
      value: 5,
      grantSource: PointGrantSource.TEACHER,
    });
    const stranger = await createUser(prisma, { roles: [Role.TEACHER] }); // معلّمٌ بلا حلقة الطالب
    await expect(
      grantPoints({ studentId: student.id, pointItemId: item.id, grantedBy: stranger.id }, prisma),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("تجاوز حدّ التكرار في الفترة ← يُرفض", async () => {
    const { manager, teacher, student } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "مرّة باليوم",
      value: 3,
      grantSource: PointGrantSource.TEACHER,
      limitPeriod: PointLimitPeriod.DAY,
      limitCount: 1,
    });
    await grantPoints({ studentId: student.id, pointItemId: item.id, grantedBy: teacher.id }, prisma);
    await expect(
      grantPoints({ studentId: student.id, pointItemId: item.id, grantedBy: teacher.id }, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("المنح الناجح — الرصيد والدفتر (مشتقّان)", () => {
  it("المعلّم يمنح طالبه بند حلقته؛ الرصيد يساوي مجموع الحركات", async () => {
    const { manager, teacher, student } = await scaffold();
    const earn = await createPointItem(manager.id, {
      nameAr: "إتقان",
      value: 5,
      grantSource: PointGrantSource.TEACHER,
    });
    const penalty = await createPointItem(manager.id, {
      nameAr: "تأخّر",
      value: -2,
      grantSource: PointGrantSource.ADMIN,
    });
    await grantPoints({ studentId: student.id, pointItemId: earn.id, grantedBy: teacher.id }, prisma);
    await grantPoints({ studentId: student.id, pointItemId: earn.id, grantedBy: manager.id }, prisma);
    await grantPoints({ studentId: student.id, pointItemId: penalty.id, grantedBy: manager.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(8); // 5 + 5 − 2

    const ledger = await getStudentLedger(student.id, prisma);
    expect(ledger.balance).toBe(8);
    expect(ledger.transactions).toHaveLength(3);
    expect(ledger.transactions[0].itemName).toBeTruthy();
  });

  it("amount لقطةٌ تاريخيّة: تعديل قيمة البند لا يُعيد كتابة حركةٍ سابقة", async () => {
    const { manager, teacher, student } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "بند",
      value: 5,
      grantSource: PointGrantSource.TEACHER,
    });
    await grantPoints({ studentId: student.id, pointItemId: item.id, grantedBy: teacher.id }, prisma);
    await updatePointItem(manager.id, item.id, {
      nameAr: "بند",
      value: 50,
      grantSource: PointGrantSource.TEACHER,
    });
    expect(await getBalance(student.id, prisma)).toBe(5); // بقيت اللقطة القديمة
  });

  it("المدير يمنح أيّ طالب (أصل الصلاحية)", async () => {
    const { manager, student } = await scaffold();
    const item = await createPointItem(manager.id, {
      nameAr: "بند",
      value: 7,
      grantSource: PointGrantSource.TEACHER,
    });
    await grantPoints({ studentId: student.id, pointItemId: item.id, grantedBy: manager.id }, prisma);
    expect(await getBalance(student.id, prisma)).toBe(7);
  });
});

describe("عروض شاشة المعلّم — البنود والطلاب المسموحة", () => {
  it("المعلّم يرى بنود المعلّم فقط (لا الإدارة ولا AUTO)؛ والمدير يرى المنح اليدويّ كلّه", async () => {
    const { manager, teacher } = await scaffold();
    await createPointItem(manager.id, { nameAr: "معلّم", value: 5, grantSource: PointGrantSource.TEACHER });
    await createPointItem(manager.id, { nameAr: "إدارة", value: 5, grantSource: PointGrantSource.ADMIN });
    await createPointItem(manager.id, { nameAr: "تلقائيّ", value: 5, grantSource: PointGrantSource.AUTO });

    const forTeacher = await listGrantableItems(teacher.id, prisma);
    expect(forTeacher.map((i) => i.grantSource)).toEqual([PointGrantSource.TEACHER]);

    const forManager = await listGrantableItems(manager.id, prisma);
    expect(forManager.map((i) => i.grantSource).sort()).toEqual(
      [PointGrantSource.ADMIN, PointGrantSource.TEACHER].sort(),
    );
  });

  it("المعلّم يرى طلاب حلقاته فقط", async () => {
    const { teacher, student } = await scaffold();
    // طالبٌ آخر في حلقةٍ ليست للمعلّم
    const otherProgram = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const otherCircle = await createCircle(prisma, otherProgram.id);
    const { student: other } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: other.id, circleId: otherCircle.id } });

    const list = await listGrantableStudents(teacher.id, prisma);
    expect(list.map((s) => s.studentId)).toEqual([student.id]);
  });
});
