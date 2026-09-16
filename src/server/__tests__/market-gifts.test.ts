import { GuardianLinkStatus, MarketItemApproval, PointGrantSource, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addGuardianGift,
  approveGuardianGift,
  createMarketItem,
  listBidderForStudent,
  listPendingGuardianGifts,
  rejectGuardianGift,
  sellToStudentByCode,
} from "../market";
import { getBalance } from "../economy";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// سقّالة: مدير + بائع + وليٌّ مرتبطٌ بابنه + طالبٌ آخر غير مرتبط.
async function scaffold() {
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  const seller = await createUser(prisma, { roles: [Role.SELLER] });
  const guardian = await createUser(prisma, { roles: [Role.GUARDIAN] });
  const { student: child, user: childUser } = await createStudent(prisma);
  await prisma.guardianLink.create({
    data: { guardianId: guardian.id, studentId: child.id, status: GuardianLinkStatus.ACTIVE },
  });
  const { student: other, user: otherUser } = await createStudent(prisma);
  return { manager, seller, guardian, child, childUser, other, otherUser };
}

async function fund(studentId: string, amount: number) {
  await prisma.pointTransaction.create({
    data: { studentId, pointItemId: "seed-fund", amount, grantSource: PointGrantSource.ADMIN },
  });
}

async function makeCode(studentId: string): Promise<string> {
  const code = `G${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await prisma.studentCode.create({
    data: { studentId, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  return code;
}

describe("إضافة ثمرة الوليّ (م٦ب-٢) — GUARDIAN ولأبنائه فقط", () => {
  it("الوليّ يضيف ثمرةً لابنه ← تبدأ PENDING بقيمةٍ مقترحة، مصدرها الوليّ", async () => {
    const { guardian, child } = await scaffold();
    const gift = await addGuardianGift(guardian.id, {
      nameAr: "دراجة", proposedPricePoints: 50, targetStudentId: child.id,
    });
    expect(gift.approvalStatus).toBe(MarketItemApproval.PENDING);
    expect(gift.pricePoints).toBe(50);
    expect(gift.proposedPricePoints).toBe(50);
    expect(gift.addedByUserId).toBe(guardian.id);
    expect(gift.targetStudentId).toBe(child.id);
  });

  it("غير GUARDIAN يضيف ثمرة وليّ ← يُرفض", async () => {
    const { manager, child } = await scaffold();
    await expect(
      addGuardianGift(manager.id, { nameAr: "x", proposedPricePoints: 10, targetStudentId: child.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("وليٌّ يضيف ثمرةً لغير ابنه ← يُرفض", async () => {
    const { guardian, other } = await scaffold();
    await expect(
      addGuardianGift(guardian.id, { nameAr: "x", proposedPricePoints: 10, targetStudentId: other.id }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("قيمةٌ مقترحةٌ غير موجبة ← تُرفض", async () => {
    const { guardian, child } = await scaffold();
    await expect(
      addGuardianGift(guardian.id, { nameAr: "x", proposedPricePoints: 0, targetStudentId: child.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("عرض البيدر للطالب — المعتمَد فقط، بلا كشف المصدر", () => {
  it("ثمرة PENDING لا تظهر في بيدر الطالب؛ وبعد الاعتماد تظهر", async () => {
    const { manager, guardian, child, childUser } = await scaffold();
    const gift = await addGuardianGift(guardian.id, { nameAr: "دراجة", proposedPricePoints: 50, targetStudentId: child.id });

    // PENDING ⟵ لا تظهر.
    expect((await listBidderForStudent(childUser.id, child.id)).map((i) => i.id)).not.toContain(gift.id);

    // بعد الاعتماد ⟵ تظهر بالقيمة المعتمَدة.
    await approveGuardianGift(manager.id, gift.id, 40);
    const bidder = await listBidderForStudent(childUser.id, child.id);
    const shown = bidder.find((i) => i.id === gift.id);
    expect(shown).toBeTruthy();
    expect(shown!.pricePoints).toBe(40);
  });

  it("ثمرةٌ موجَّهةٌ لطالبٍ لا تظهر في بيدر طالبٍ آخر", async () => {
    const { manager, guardian, child, other, otherUser } = await scaffold();
    const gift = await addGuardianGift(guardian.id, { nameAr: "خاصّة", proposedPricePoints: 20, targetStudentId: child.id });
    await approveGuardianGift(manager.id, gift.id, 20);
    expect((await listBidderForStudent(otherUser.id, other.id)).map((i) => i.id)).not.toContain(gift.id);
  });

  it("الثمرة العامّة المعتمَدة تظهر لكلّ الطلاب", async () => {
    const { manager, guardian, other, otherUser } = await scaffold();
    const gift = await addGuardianGift(guardian.id, { nameAr: "عامّة", proposedPricePoints: 15 }); // بلا target
    await approveGuardianGift(manager.id, gift.id, 15);
    expect((await listBidderForStudent(otherUser.id, other.id)).map((i) => i.id)).toContain(gift.id);
  });

  it("لا يكشف المصدر: عناصر البيدر لا تحمل addedBy إطلاقًا", async () => {
    const { manager, guardian, child, childUser } = await scaffold();
    const gift = await addGuardianGift(guardian.id, { nameAr: "دراجة", proposedPricePoints: 50, targetStudentId: child.id });
    await approveGuardianGift(manager.id, gift.id, 50);
    const item = (await listBidderForStudent(childUser.id, child.id)).find((i) => i.id === gift.id)!;
    expect(Object.keys(item).sort()).toEqual(["id", "imageUrl", "nameAr", "pricePoints", "stock"]);
  });
});

describe("اعتماد/رفض الإدارة", () => {
  it("قائمة المعلّقة للإدارة تحمل المقترِح والطالب المستهدف؛ وغير الإدارة يُرفض", async () => {
    const { manager, guardian, child } = await scaffold();
    await addGuardianGift(guardian.id, { nameAr: "دراجة", proposedPricePoints: 50, targetStudentId: child.id });
    const pending = await listPendingGuardianGifts(manager.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].proposedByName).toBeTruthy();
    expect(pending[0].targetStudentName).toBeTruthy();
    await expect(listPendingGuardianGifts(guardian.id)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("الرفض ← REJECTED فلا تظهر في البيدر", async () => {
    const { manager, guardian, child, childUser } = await scaffold();
    const gift = await addGuardianGift(guardian.id, { nameAr: "x", proposedPricePoints: 10, targetStudentId: child.id });
    await rejectGuardianGift(manager.id, gift.id);
    expect((await listBidderForStudent(childUser.id, child.id)).map((i) => i.id)).not.toContain(gift.id);
  });

  it("لا يُعتمَد إلّا ما هو بانتظار الموافقة (اعتماد ثمرةٍ معتمَدةٍ ← يُرفض)", async () => {
    const { manager } = await scaffold();
    const item = await createMarketItem(manager.id, { nameAr: "إداريّة", pricePoints: 5 }); // APPROVED افتراضًا
    await expect(approveGuardianGift(manager.id, item.id, 9)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("الجَنْي يحترم الاعتماد والتوجيه", () => {
  it("لا تُجنى ثمرةٌ PENDING", async () => {
    const { seller, guardian, child } = await scaffold();
    await fund(child.id, 100);
    const gift = await addGuardianGift(guardian.id, { nameAr: "دراجة", proposedPricePoints: 50, targetStudentId: child.id });
    const code = await makeCode(child.id);
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: gift.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await getBalance(child.id)).toBe(100); // لا خصم
  });

  it("لا يجني طالبٌ ثمرةً موجَّهةً لطالبٍ آخر", async () => {
    const { manager, seller, guardian, child, other } = await scaffold();
    await fund(other.id, 100);
    const gift = await addGuardianGift(guardian.id, { nameAr: "خاصّة", proposedPricePoints: 20, targetStudentId: child.id });
    await approveGuardianGift(manager.id, gift.id, 20);
    const code = await makeCode(other.id); // كود الطالب الآخر
    await expect(
      sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: gift.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("الجَنْي الناجح لثمرة الوليّ المعتمَدة الموجَّهة لابنه — خصمٌ في دفتر م٦أ", async () => {
    const { manager, seller, guardian, child } = await scaffold();
    await fund(child.id, 60);
    const gift = await addGuardianGift(guardian.id, { nameAr: "دراجة", proposedPricePoints: 50, targetStudentId: child.id });
    await approveGuardianGift(manager.id, gift.id, 40); // الإدارة عدّلت القيمة
    const code = await makeCode(child.id);
    const res = await sellToStudentByCode({ sellerUserId: seller.id, code, marketItemId: gift.id });
    expect(res.pricePaid).toBe(40);
    expect(await getBalance(child.id)).toBe(20);
  });
});
