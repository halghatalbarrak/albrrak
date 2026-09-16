import { GuardianLinkStatus, PointGrantSource, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createMarketItem,
  listMarketItems,
  listSellableItems,
  listGuardedStudents,
  lookupStudentByCode,
  requestStudentCode,
  sellToStudentByCode,
  setMarketItemActive,
} from "../market";
import { getBalance } from "../economy";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة: مدير + بائع + طالبٌ (بحسابه).
async function scaffold() {
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  const seller = await createUser(prisma, { roles: [Role.SELLER] });
  const { student, user: studentUser } = await createStudent(prisma);
  return { manager, seller, student, studentUser };
}

// تمويل رصيد الطالب مباشرةً في دفتر م٦أ (بلا FK) — لا يمسّ منطق م٦أ.
async function fund(studentId: string, amount: number) {
  await prisma.pointTransaction.create({
    data: { studentId, pointItemId: "seed-fund", amount, grantSource: PointGrantSource.ADMIN },
  });
}

// كودٌ مضبوطٌ للاختبار (انتهاء/استعمال). uppercase ليطابق تطبيع البحث.
async function makeCode(
  studentId: string,
  opts: { expiresInMs?: number; usedAt?: Date } = {},
): Promise<string> {
  const code = `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await prisma.studentCode.create({
    data: {
      studentId,
      code,
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 5 * 60 * 1000)),
      usedAt: opts.usedAt ?? null,
    },
  });
  return code;
}

describe("إدارة السلع (م٦ب) — للإدارة وحدها، لا حذف", () => {
  it("المدير ينشئ سلعةً بسعرٍ موجب، وتظهر في القائمة", async () => {
    const { manager } = await scaffold();
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 10 });
    expect(item.pricePoints).toBe(10);
    expect(item.active).toBe(true);
    expect(await listMarketItems(manager.id)).toHaveLength(1);
  });

  it("غير الإدارة (بائع) لا يُنشئ سلعةً ← يُرفض", async () => {
    const { seller } = await scaffold();
    await expect(
      createMarketItem(seller.id, { nameAr: "قلم", pricePoints: 10 }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("سعرٌ صفرٌ أو سالب يُرفض", async () => {
    const { manager } = await scaffold();
    await expect(createMarketItem(manager.id, { nameAr: "x", pricePoints: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(createMarketItem(manager.id, { nameAr: "x", pricePoints: -5 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("مخزونٌ سالب يُرفض", async () => {
    const { manager } = await scaffold();
    await expect(
      createMarketItem(manager.id, { nameAr: "x", pricePoints: 5, stock: -1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("التعطيل لا حذف — والسلعة المعطَّلة تبقى في القائمة وتخرج من شبكة البيع", async () => {
    const { manager, seller } = await scaffold();
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await setMarketItemActive(manager.id, item.id, false);
    expect(await listMarketItems(manager.id)).toHaveLength(1);
    expect(await listSellableItems(seller.id)).toHaveLength(0);
  });

  it("شبكة البيع تُخفي النافد (مخزون صفر) وغير البائع لا يراها", async () => {
    const { manager, seller } = await scaffold();
    await createMarketItem(manager.id, { nameAr: "متاح", pricePoints: 5, stock: 3 });
    await createMarketItem(manager.id, { nameAr: "نافد", pricePoints: 5, stock: 0 });
    expect((await listSellableItems(seller.id)).map((i) => i.nameAr)).toEqual(["متاح"]);
    await expect(listSellableItems(manager.id)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("كود الطالب — الطالب أو وليّه فقط", () => {
  it("الطالب يطلب كودَه (نفسه) — ينتهي بعد ~٥ دقائق", async () => {
    const { studentUser } = await scaffold();
    const issued = await requestStudentCode(studentUser.id, undefined);
    expect(issued.code).toMatch(/^[A-Z0-9]{6}$/);
    const ms = issued.expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(4 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
  });

  it("الوليّ يطلب كود ابنه (رابطٌ نشط)", async () => {
    const { student } = await scaffold();
    const guardian = await createUser(prisma, { roles: [Role.GUARDIAN] });
    await prisma.guardianLink.create({ data: { guardianId: guardian.id, studentId: student.id, status: GuardianLinkStatus.ACTIVE } });
    const issued = await requestStudentCode(guardian.id, student.id);
    expect(issued.code).toBeTruthy();
    expect(await listGuardedStudents(guardian.id)).toHaveLength(1);
  });

  it("من ليس وليًّا ولا الطالب نفسه ← يُرفض طلب كود ذلك الطالب", async () => {
    const { student } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.GUARDIAN] }); // بلا رابط
    await expect(requestStudentCode(stranger.id, student.id)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("حسابٌ بلا سجلّ طالبٍ يطلب كودَ نفسه ← يُرفض", async () => {
    const someone = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(requestStudentCode(someone.id, undefined)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("بحث الكود — خصوصيّة الطالب (اسمٌ ورصيدٌ فقط)", () => {
  it("البائع يرى اسم الطالب ورصيده فقط — لا سجلّه التعليميّ", async () => {
    const { seller, student, studentUser } = await scaffold();
    await fund(student.id, 30);
    const code = await makeCode(student.id);
    const card = await lookupStudentByCode(seller.id, code);
    expect(card).toEqual({ studentId: student.id, name: studentUser.nameAsInId, balance: 30 });
    // لا تسريب لأيّ حقلٍ تعليميّ (حالة/برنامج/مسار…).
    expect(Object.keys(card).sort()).toEqual(["balance", "name", "studentId"]);
  });

  it("غير البائع لا يبحث كودًا ← يُرفض", async () => {
    const { manager, student } = await scaffold();
    const code = await makeCode(student.id);
    await expect(lookupStudentByCode(manager.id, code)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("كودٌ منتهٍ أو مستعمَل أو غير موجود ← يُرفض البحث", async () => {
    const { seller, student } = await scaffold();
    const expired = await makeCode(student.id, { expiresInMs: -1000 });
    const used = await makeCode(student.id, { usedAt: new Date() });
    await expect(lookupStudentByCode(seller.id, expired)).rejects.toBeInstanceOf(ValidationError);
    await expect(lookupStudentByCode(seller.id, used)).rejects.toBeInstanceOf(ValidationError);
    await expect(lookupStudentByCode(seller.id, "ZZZZZZ")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("عمليّة البيع — القواعد المطلقة في الخادم (اختبارات الرفض)", () => {
  it("غير البائع يحاول البيع ← يُرفض", async () => {
    const { manager, student } = await scaffold();
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await expect(
      sellToStudentByCode({ sellerUserId: manager.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("كودٌ منتهٍ ← يُرفض", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 100);
    const code = await makeCode(student.id, { expiresInMs: -1000 });
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("كودٌ مستعمَل ← يُرفض", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 100);
    const code = await makeCode(student.id, { usedAt: new Date() });
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("رصيدٌ غير كافٍ ← يُرفض (ولا خصم)", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 3);
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await getBalance(student.id)).toBe(3); // لم يُخصَم شيء
  });

  it("سلعةٌ معطّلة ← يُرفض", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 100);
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await setMarketItemActive(manager.id, item.id, false);
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("مخزونٌ نافد ← يُرفض", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 100);
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5, stock: 0 });
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("عمليّة البيع الناجحة — الخصم في دفتر م٦أ نفسه", () => {
  it("يخصم السعر (حركةٌ سالبة) + Purchase + يعلّم الكود مستعملًا + ينقص المخزون", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 30);
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "دفتر", pricePoints: 12, stock: 2 });

    const res = await sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id });
    expect(res.pricePaid).toBe(12);
    expect(res.balanceAfter).toBe(18);

    // الرصيد مشتقٌّ من الدفتر — نقص فعلًا.
    expect(await getBalance(student.id)).toBe(18);

    // حركةٌ سالبةٌ مربوطةٌ بالشراء.
    const purchase = await prisma.purchase.findFirstOrThrow({ where: { studentId: student.id } });
    expect(purchase.pricePaid).toBe(12);
    expect(purchase.sellerUserId).toBe(seller.id);
    const txn = await prisma.pointTransaction.findUniqueOrThrow({ where: { id: purchase.pointTransactionId! } });
    expect(txn.amount).toBe(-12);

    // الكود صار مستعملًا، والمخزون نقص إلى ١.
    const usedCode = await prisma.studentCode.findUniqueOrThrow({ where: { code } });
    expect(usedCode.usedAt).not.toBeNull();
    const after = await prisma.marketItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.stock).toBe(1);
  });

  it("إعادة استعمال الكود نفسه بعد بيعٍ ناجح ← يُرفض (مستعمَل)", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 30);
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "قلم", pricePoints: 5 });
    await sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id });
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("مخزونٌ بلا حدّ (null) يُباع بلا خطأ ولا يُنقَص", async () => {
    const { manager, seller, student } = await scaffold();
    await fund(student.id, 30);
    const code = await makeCode(student.id);
    const item = await createMarketItem(manager.id, { nameAr: "حلوى", pricePoints: 4 });
    await sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: item.id });
    const after = await prisma.marketItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.stock).toBeNull();
    expect(await getBalance(student.id)).toBe(26);
  });
});
