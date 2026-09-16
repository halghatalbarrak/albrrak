import { randomInt } from "node:crypto";

import {
  GuardianLinkStatus,
  MarketItemApproval,
  PointGrantSource,
  Role,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getBalance } from "./economy";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ الاقتصاد — السوق الحقيقيّ بالكود (م٦ب) ═══════════════
//
// ECONOMY_RULES.md الركن ٢. **القواعد المطلقة في الخادم لا الواجهة** (DESIGN §٢):
//   • إدارة السلع (إضافة/تعديل/تعطيل — لا حذف): الإدارة وحدها (كإدارة بنود م٦أ).
//   • كود الطالب: يطلبه الطالب أو وليّه فقط؛ متغيّرٌ لحظيّ ينتهي بعد ~٥ دقائق، يُستعمل مرّةً.
//   • البيع: SELLER **وحده** يملكه. يُتحقَّق الكود (صالح/غير منتهٍ/غير مستعمل)، ثمّ يُعرَض
//     اسم الطالب ورصيده **فقط** (لا سجلّه التعليميّ)، ثمّ يُخصَم السعر المثبّت (البائع لا
//     يُدخل السعر): تحقّقٌ من الرصيد والتفعيل والمخزون ← حركةٌ سالبةٌ في دفتر م٦أ +
//     Purchase + وسمُ الكود مستعملًا + إنقاص المخزون — كلّه في معاملةٍ ذرّيّة.
//
// **لا رصيد منفصل:** الخصم حركةٌ في PointTransaction (دفتر م٦أ)، فالرصيد يبقى SUM(amount).
// لا نمسّ جدول م٦أ ولا منطقه — نكتب فيه فحسب عبر «بند نظاميّ» يُنشأ بـupsert (يبقى بعد
// تصفير الاختبارات). الحركة grantSource=AUTO (خصمٌ آليٌّ على البيع)، grantedالبائع.

const ADMIN_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// بندٌ نظاميّ (م٦أ) يجمع كلّ خصوم السوق تحت مسمّى واحد في الدفتر — قيمته لقطةٌ per-txn،
// فقيمة البند نفسها لا تُستعمل (AUTO ⟵ لا يُمنح يدويًّا). يُنشأ بـupsert عند أوّل بيع.
const MARKET_ITEM_ID = "system-market-purchase";
const MARKET_ITEM_NAME = "جَنْي من البيدر";

const CODE_TTL_MS = 5 * 60 * 1000; // ~٥ دقائق
const CODE_LENGTH = 6;
// أبجديّةٌ غير ملتبسة (بلا O/0/I/1/L) — تُقرأ وتُدخَل بلا خطأ على شاشة البيع.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function isAdmin(roles: Role[]): boolean {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

/** يرمي AuthorizationError إن لم يكن الفاعل من كادر الإدارة (كإدارة بنود م٦أ). */
async function assertMarketAdmin(actorId: string, db: PrismaClient): Promise<Role[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!isAdmin(actor.roles)) {
    throw new AuthorizationError("إدارة الثمار للإدارة وحدها (ECONOMY_RULES الركن ٢).");
  }
  return actor.roles;
}

/** يرمي AuthorizationError إن لم يكن الفاعل بائعًا (Role.SELLER)، ويعيد أدواره. */
async function assertSeller(actorId: string, db: PrismaClient): Promise<Role[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!actor.roles.includes(Role.SELLER)) {
    throw new AuthorizationError("الجَنْي لأمين البيدر وحده (Role.SELLER).");
  }
  return actor.roles;
}

// ═══════════════ إدارة السلع (CRUD — للإدارة، لا حذف) ═══════════════

export interface MarketItemInput {
  nameAr: string;
  pricePoints: number;
  imageUrl?: string | null;
  stock?: number | null;
}

/** يتحقّق من صحّة حقول السلعة (السعر عددٌ موجب، والمخزون null أو صفرٌ فأكثر). */
function validateItemInput(input: MarketItemInput): {
  nameAr: string;
  pricePoints: number;
  imageUrl: string | null;
  stock: number | null;
} {
  const nameAr = input.nameAr?.trim();
  if (!nameAr) throw new ValidationError("اسم الثمرة مطلوب.");
  if (!Number.isInteger(input.pricePoints) || input.pricePoints < 1) {
    throw new ValidationError("قيمة الثمرة عددٌ صحيحٌ موجب (١ فأكثر).");
  }
  let stock: number | null = null;
  if (input.stock != null) {
    if (!Number.isInteger(input.stock) || input.stock < 0) {
      throw new ValidationError("المتوفّر عددٌ صحيحٌ غير سالب، أو اتركه فارغًا (بلا حدّ).");
    }
    stock = input.stock;
  }
  const imageUrl = input.imageUrl?.trim() || null;
  return { nameAr, pricePoints: input.pricePoints, imageUrl, stock };
}

export async function createMarketItem(
  actorId: string,
  input: MarketItemInput,
  db: PrismaClient = prisma,
) {
  await assertMarketAdmin(actorId, db);
  const data = validateItemInput(input);
  const item = await db.marketItem.create({ data });
  await emitEvent(db, {
    type: "MARKET_ITEM_CREATED",
    subjectType: "MarketItem",
    subjectId: item.id,
    actorId,
    payload: { nameAr: item.nameAr, pricePoints: item.pricePoints },
  });
  return item;
}

export async function updateMarketItem(
  actorId: string,
  itemId: string,
  input: MarketItemInput,
  db: PrismaClient = prisma,
) {
  await assertMarketAdmin(actorId, db);
  const existing = await db.marketItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!existing) throw new ValidationError("ثمرة غير موجودة.");
  const data = validateItemInput(input);
  const item = await db.marketItem.update({ where: { id: itemId }, data });
  await emitEvent(db, {
    type: "MARKET_ITEM_UPDATED",
    subjectType: "MarketItem",
    subjectId: item.id,
    actorId,
    payload: { pricePoints: item.pricePoints, stock: item.stock },
  });
  return item;
}

/** تعطيل/تفعيل سلعة — لا حذف (ECONOMY_RULES الركن ٢). */
export async function setMarketItemActive(
  actorId: string,
  itemId: string,
  active: boolean,
  db: PrismaClient = prisma,
) {
  await assertMarketAdmin(actorId, db);
  const existing = await db.marketItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!existing) throw new ValidationError("ثمرة غير موجودة.");
  const item = await db.marketItem.update({ where: { id: itemId }, data: { active } });
  await emitEvent(db, {
    type: active ? "MARKET_ITEM_ENABLED" : "MARKET_ITEM_DISABLED",
    subjectType: "MarketItem",
    subjectId: item.id,
    actorId,
  });
  return item;
}

/** كلّ السلع (المفعّلة أوّلًا) — لشاشة الإدارة. */
export async function listMarketItems(actorId: string, db: PrismaClient = prisma) {
  await assertMarketAdmin(actorId, db);
  return db.marketItem.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
}

export interface SellableItem {
  id: string;
  nameAr: string;
  imageUrl: string | null;
  pricePoints: number;
  stock: number | null;
}

/**
 * الثمرات العامّة المتاحة للجَنْي (مفعّلة · معتمَدة · عامّة · المخزون غير نافد) — للبائع
 * قبل تحديد الطالب. لا تشمل ثمرة الوليّ المعلّقة (PENDING) ولا الموجَّهة لطالبٍ بعينه.
 */
export async function listSellableItems(
  actorId: string,
  db: PrismaClient = prisma,
): Promise<SellableItem[]> {
  await assertSeller(actorId, db);
  const items = await db.marketItem.findMany({
    where: { active: true, approvalStatus: MarketItemApproval.APPROVED, targetStudentId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, nameAr: true, imageUrl: true, pricePoints: true, stock: true },
  });
  // نُخفي النافد (stock=0) من الشبكة؛ والخادم يرفضه أيضًا في الجَنْي (حارسٌ مزدوج).
  return items.filter((i) => i.stock == null || i.stock > 0);
}

/**
 * بيدر طالبٍ بعينه للبائع بعد تحديده بالرمز: الثمرات المعتمَدة المتاحة التي يحقّ لهذا
 * الطالب جَنْيُها — العامّة + الموجَّهة إليه وحده. (المصدر addedالبائع لا يُعرَض.)
 */
export async function listSellableItemsForStudent(
  sellerUserId: string,
  studentId: string,
  db: PrismaClient = prisma,
): Promise<SellableItem[]> {
  await assertSeller(sellerUserId, db);
  return bidderItems(studentId, db);
}

/**
 * محرّك عرض البيدر لطالب: مفعّلة · معتمَدة · (عامّة أو موجَّهة له) · المخزون غير نافد.
 * لا يُرجِع addedByUserId إطلاقًا (خصوصيّة المصدر عن الطالب — ECONOMY_RULES الركن ٢-ب).
 */
async function bidderItems(studentId: string, db: PrismaClient): Promise<SellableItem[]> {
  const items = await db.marketItem.findMany({
    where: {
      active: true,
      approvalStatus: MarketItemApproval.APPROVED,
      OR: [{ targetStudentId: null }, { targetStudentId: studentId }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, nameAr: true, imageUrl: true, pricePoints: true, stock: true },
  });
  return items.filter((i) => i.stock == null || i.stock > 0);
}

// ═══════════════ كود الطالب المتغيّر (الطالب أو وليّه) ═══════════════

/** يولّد كودًا قصيرًا عشوائيًّا من الأبجديّة غير الملتبسة. */
function newCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/**
 * يحسم الطالب المستهدف لطلب الكود: الطالب نفسه، أو وليٌّ نشطٌ عليه (GuardianLink ACTIVE).
 * دون ١٣ لا حساب له (م٤)، فوليّه هو من يُظهر كودَه — ولذا نقبل studentId من الوليّ.
 */
async function resolveCodeTarget(
  callerUserId: string,
  studentId: string | undefined,
  db: PrismaClient,
): Promise<string> {
  if (studentId) {
    const s = await db.student.findUnique({ where: { id: studentId }, select: { id: true, userId: true } });
    if (!s) throw new ValidationError("طالب غير موجود.");
    if (s.userId === callerUserId) return s.id;
    const link = await db.guardianLink.findFirst({
      where: { guardianId: callerUserId, studentId, status: GuardianLinkStatus.ACTIVE },
      select: { id: true },
    });
    if (!link) throw new AuthorizationError("لا تملك طلب كودٍ لهذا الطالب.");
    return s.id;
  }
  const u = await db.user.findUnique({ where: { id: callerUserId }, select: { student: { select: { id: true } } } });
  if (!u?.student) throw new ValidationError("لا سجلّ طالبٍ مرتبطٌ بحسابك.");
  return u.student.id;
}

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

/**
 * يطلب كودًا للطالب (نفسه أو وليّه). كودٌ متغيّرٌ لحظيّ ينتهي بعد ~٥ دقائق، يُستعمل مرّةً.
 * التكرار مسموح (يتجدّد)؛ الأكواد القديمة تنتهي بمضيّ الوقت. تصادم الكود ⟵ إعادة توليد.
 */
export async function requestStudentCode(
  callerUserId: string,
  studentId: string | undefined,
  db: PrismaClient = prisma,
): Promise<IssuedCode> {
  const target = await resolveCodeTarget(callerUserId, studentId, db);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const row = await db.studentCode.create({
        data: { studentId: target, code: newCode(), expiresAt },
        select: { code: true, expiresAt: true },
      });
      return { code: row.code, expiresAt: row.expiresAt };
    } catch (e) {
      // تصادم فريد على code ⟵ أعِد التوليد. أيّ خطأٍ آخر يُرمى.
      if ((e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
  throw new ValidationError("تعذّر توليد رمزٍ فريد — أعِد المحاولة.");
}

// ═══════════════ بحث الكود (البائع: اسمٌ ورصيدٌ فقط) ═══════════════

export interface CodeLookup {
  studentId: string;
  name: string;
  balance: number;
}

/**
 * يتحقّق الكود ويعيد اسم الطالب ورصيده **فقط** — لا سجلّه التعليميّ (خصوصيّة الطالب،
 * DESIGN §٢/§٤: البائع من خارج الكادر يرى الاسم والرصيد لا غير). للبائع وحده.
 */
export async function lookupStudentByCode(
  sellerUserId: string,
  rawCode: string,
  db: PrismaClient = prisma,
): Promise<CodeLookup> {
  await assertSeller(sellerUserId, db);
  const code = rawCode?.trim().toUpperCase();
  if (!code) throw new ValidationError("أدخل الرمز.");

  const row = await db.studentCode.findUnique({
    where: { code },
    select: { studentId: true, usedAt: true, expiresAt: true },
  });
  if (!row) throw new ValidationError("رمز غير صالح.");
  if (row.usedAt) throw new ValidationError("رمزٌ مستعمَل من قبل.");
  if (row.expiresAt.getTime() < Date.now()) throw new ValidationError("انتهت صلاحيّة الرمز — اطلب رمزًا جديدًا.");

  const student = await db.student.findUnique({
    where: { id: row.studentId },
    select: { id: true, user: { select: { nameAsInId: true } } },
  });
  if (!student) throw new ValidationError("طالب غير موجود.");

  return {
    studentId: student.id,
    name: student.user.nameAsInId,
    balance: await getBalance(student.id, db),
  };
}

// ═══════════════ عمليّة البيع (SELLER وحده — ذرّيّة) ═══════════════

export interface SellArgs {
  sellerUserId: string;
  code: string;
  marketItemId: string;
}

export interface SellResult {
  purchaseId: string;
  itemName: string;
  pricePaid: number;
  balanceAfter: number;
}

/**
 * يبيع سلعةً لطالبٍ بكوده. كلّ القواعد المطلقة تُفحص داخل معاملةٍ واحدة (تمنع البيع المزدوج
 * والصرف الزائد والتسابق على المخزون): الكود صالحٌ غير منتهٍ غير مستعمل · السلعة مفعّلة ·
 * المخزون متاح · الرصيد يكفي السعر المثبّت. البائع لا يُدخل السعر.
 */
export async function sellToStudentByCode(args: SellArgs, db: PrismaClient = prisma): Promise<SellResult> {
  await assertSeller(args.sellerUserId, db);
  const code = args.code?.trim().toUpperCase();
  if (!code) throw new ValidationError("أدخل الرمز.");

  return db.$transaction(async (tx) => {
    // ١) الكود صالح؟
    const codeRow = await tx.studentCode.findUnique({
      where: { code },
      select: { id: true, studentId: true, usedAt: true, expiresAt: true },
    });
    if (!codeRow) throw new ValidationError("رمز غير صالح.");
    if (codeRow.usedAt) throw new ValidationError("رمزٌ مستعمَل من قبل.");
    if (codeRow.expiresAt.getTime() < Date.now()) {
      throw new ValidationError("انتهت صلاحيّة الرمز — اطلب رمزًا جديدًا.");
    }

    // ٢) الثمرة مفعّلة · معتمَدة · في بيدر هذا الطالب · والمخزون متاح؟
    const item = await tx.marketItem.findUnique({ where: { id: args.marketItemId } });
    if (!item) throw new ValidationError("ثمرة غير موجودة.");
    if (!item.active) throw new ValidationError("الثمرة معطّلة — لا تُجنى.");
    // م٦ب-٢: لا تُجنى ثمرةٌ غير معتمَدة (PENDING/REJECTED)، ولا ثمرةٌ موجَّهةٌ لطالبٍ آخر.
    if (item.approvalStatus !== MarketItemApproval.APPROVED) {
      throw new ValidationError("الثمرة غير معتمَدة بعد — لا تُجنى.");
    }
    if (item.targetStudentId != null && item.targetStudentId !== codeRow.studentId) {
      throw new ValidationError("هذه الثمرة ليست في بيدر هذا الطالب.");
    }
    if (item.stock != null && item.stock <= 0) throw new ValidationError("المتوفّر نفد.");

    // ٣) الرصيد يكفي السعر المثبّت؟ (الرصيد = SUM(amount) — دفتر م٦أ نفسه، داخل المعاملة)
    const agg = await tx.pointTransaction.aggregate({
      where: { studentId: codeRow.studentId },
      _sum: { amount: true },
    });
    const balance = agg._sum.amount ?? 0;
    if (balance < item.pricePoints) throw new ValidationError("الرصيد لا يكفي قيمة الثمرة.");

    // ٤) وسمُ الكود مستعملًا — محميٌّ من السباق (لا يُستعمل إلا إن كان لم يُستعمل بعد).
    const usedNow = await tx.studentCode.updateMany({
      where: { id: codeRow.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (usedNow.count === 0) throw new ValidationError("رمزٌ مستعمَل من قبل.");

    // ٥) إنقاص المخزون — محميٌّ من السباق (لا يُنقَص إن نفد بين الفحص والكتابة).
    if (item.stock != null) {
      const dec = await tx.marketItem.updateMany({
        where: { id: item.id, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (dec.count === 0) throw new ValidationError("المتوفّر نفد.");
    }

    // ٦) الخصم في دفتر م٦أ عبر البند النظاميّ (upsert — يبقى بعد تصفير الاختبارات).
    await tx.pointItem.upsert({
      where: { id: MARKET_ITEM_ID },
      create: {
        id: MARKET_ITEM_ID,
        nameAr: MARKET_ITEM_NAME,
        value: -1, // لقطةٌ per-txn تُستعمل لا هذه؛ AUTO ⟵ لا يُمنح يدويًّا
        grantSource: PointGrantSource.AUTO,
        active: true,
      },
      update: {},
    });
    const txn = await tx.pointTransaction.create({
      data: {
        studentId: codeRow.studentId,
        pointItemId: MARKET_ITEM_ID,
        amount: -item.pricePoints, // خصمٌ سالب — لقطةٌ تاريخيّة للسعر
        grantSource: PointGrantSource.AUTO,
        grantedByUserId: args.sellerUserId, // من أجرى البيع
        note: `جَنْي: ${item.nameAr}`,
      },
    });

    // ٧) سجلّ الشراء
    const purchase = await tx.purchase.create({
      data: {
        studentId: codeRow.studentId,
        marketItemId: item.id,
        pricePaid: item.pricePoints,
        sellerUserId: args.sellerUserId,
        pointTransactionId: txn.id,
      },
    });

    await emitEvent(tx, {
      type: "MARKET_PURCHASE",
      subjectType: "Student",
      subjectId: codeRow.studentId,
      actorId: args.sellerUserId,
      payload: { marketItemId: item.id, pricePaid: item.pricePoints, purchaseId: purchase.id },
    });

    return {
      purchaseId: purchase.id,
      itemName: item.nameAr,
      pricePaid: item.pricePoints,
      balanceAfter: balance - item.pricePoints,
    };
  });
}

// ═══════════════ عرضٌ للوليّ: أبناؤه (لإظهار أكوادهم) ═══════════════

export interface GuardedStudent {
  studentId: string;
  name: string;
}

/** الطلاب الذين يلي عليهم المستخدم (روابط نشطة) — لإظهار كود كلٍّ منهم في «صفحتي». */
export async function listGuardedStudents(
  userId: string,
  db: PrismaClient = prisma,
): Promise<GuardedStudent[]> {
  const links = await db.guardianLink.findMany({
    where: { guardianId: userId, status: GuardianLinkStatus.ACTIVE },
    select: { student: { select: { id: true, user: { select: { nameAsInId: true } } } } },
  });
  return links
    .map((l) => ({ studentId: l.student.id, name: l.student.user.nameAsInId }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ═══════════════ هدايا وليّ الأمر (م٦ب-٢) — ECONOMY_RULES الركن ٢-ب ═══════════════
//
// امتدادٌ لنموذج الثمرة — لا نظام جديد. القواعد المطلقة في الخادم:
//   • الإضافة: GUARDIAN وحده، ولأبنائه المرتبطين به فقط (الموجَّهة)؛ تبدأ PENDING.
//   • العرض للطالب: العامّة المعتمَدة + الموجَّهة إليه المعتمَدة فقط — بلا كشف المصدر.
//   • الاعتماد: الإدارة تثبّت القيمة (من المقترحة أو تعدّلها) ← APPROVED، أو REJECTED.
//   • الجَنْي: بنفس المسار (sellToStudentByCode) — يحترم الاعتماد والتوجيه (حارسٌ في الخادم).

/** يرمي AuthorizationError إن لم يكن الفاعل وليَّ أمر (Role.GUARDIAN). */
async function assertGuardian(actorId: string, db: PrismaClient): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!actor.roles.includes(Role.GUARDIAN)) {
    throw new AuthorizationError("إضافة الثمرة لوليّ الأمر (Role.GUARDIAN).");
  }
}

export interface GuardianGiftInput {
  nameAr: string;
  proposedPricePoints: number;
  imageUrl?: string | null;
  /** طالبٌ بعينه (خاصّة به) أو null/غياب (عامّة لكلّ البيدر). */
  targetStudentId?: string | null;
}

/**
 * وليّ الأمر يضيف ثمرةً (جائزة): تبدأ PENDING بقيمةٍ مقترحة، addedBy=الوليّ. الموجَّهة
 * تحتاج ولايةً نشطةً على الطالب (وإلّا رُفضت). القيمة المثبّتة تُساوي المقترحة حتى يعتمدها
 * المدير أو يعدّلها. المخزون الافتراضيّ ١ (جائزةٌ واحدةٌ يُحضِرها الوليّ).
 */
export async function addGuardianGift(
  guardianUserId: string,
  input: GuardianGiftInput,
  db: PrismaClient = prisma,
) {
  await assertGuardian(guardianUserId, db);

  const nameAr = input.nameAr?.trim();
  if (!nameAr) throw new ValidationError("اسم الثمرة مطلوب.");
  if (!Number.isInteger(input.proposedPricePoints) || input.proposedPricePoints < 1) {
    throw new ValidationError("القيمة المقترحة عددٌ صحيحٌ موجب (١ فأكثر).");
  }
  const imageUrl = input.imageUrl?.trim() || null;

  let targetStudentId: string | null = null;
  if (input.targetStudentId) {
    // ثمرةٌ موجَّهة ⟵ لا بدّ من ولايةٍ نشطةٍ على هذا الطالب (رفضُ «لغير ابنه»).
    const link = await db.guardianLink.findFirst({
      where: { guardianId: guardianUserId, studentId: input.targetStudentId, status: GuardianLinkStatus.ACTIVE },
      select: { id: true },
    });
    if (!link) throw new AuthorizationError("لا تملك إضافة ثمرةٍ لهذا الطالب.");
    targetStudentId = input.targetStudentId;
  }

  const item = await db.marketItem.create({
    data: {
      nameAr,
      imageUrl,
      pricePoints: input.proposedPricePoints, // القيمة المثبّتة = المقترحة حتى يعتمدها المدير
      proposedPricePoints: input.proposedPricePoints,
      stock: 1, // جائزةٌ واحدةٌ يُحضِرها الوليّ (الإدارة تعدّلها إن شاءت)
      addedByUserId: guardianUserId,
      targetStudentId,
      approvalStatus: MarketItemApproval.PENDING,
    },
  });
  await emitEvent(db, {
    type: "GUARDIAN_GIFT_PROPOSED",
    subjectType: "MarketItem",
    subjectId: item.id,
    actorId: guardianUserId,
    payload: { proposedPricePoints: input.proposedPricePoints, targetStudentId },
  });
  return item;
}

/**
 * بيدر طالبٍ لعرضه للطالب نفسه أو وليّه (نافذةٌ لا جَنْي): الثمرات المعتمَدة المتاحة له.
 * **لا يكشف المصدر** (addedBy) للطالب — خصوصيّة الركن ٢-ب. الوصول: الطالب أو وليٌّ نشط.
 */
export async function listBidderForStudent(
  viewerUserId: string,
  studentId: string | undefined,
  db: PrismaClient = prisma,
): Promise<SellableItem[]> {
  const target = await resolveCodeTarget(viewerUserId, studentId, db); // الطالب نفسه أو وليٌّ نشط
  return bidderItems(target, db);
}

export interface PendingGift {
  id: string;
  nameAr: string;
  imageUrl: string | null;
  proposedPricePoints: number | null;
  targetStudentId: string | null;
  targetStudentName: string | null; // null = عامّة
  proposedByName: string | null;    // للإدارة فقط — لا يظهر للطالب أبدًا
  createdAt: Date;
}

/** ثمرات الوليّ المعلّقة (PENDING) — لشاشة الإدارة، مع مقترِحها والطالب المستهدف. */
export async function listPendingGuardianGifts(
  actorId: string,
  db: PrismaClient = prisma,
): Promise<PendingGift[]> {
  await assertMarketAdmin(actorId, db);
  const rows = await db.marketItem.findMany({
    where: { approvalStatus: MarketItemApproval.PENDING },
    orderBy: { createdAt: "asc" },
  });

  // أسماء المقترِحين والطلاب المستهدَفين (بلا FK — استعلامٌ واحدٌ لكلٍّ).
  const proposerIds = [...new Set(rows.map((r) => r.addedByUserId).filter((x): x is string => !!x))];
  const targetIds = [...new Set(rows.map((r) => r.targetStudentId).filter((x): x is string => !!x))];
  const [proposers, targets] = await Promise.all([
    proposerIds.length
      ? db.user.findMany({ where: { id: { in: proposerIds } }, select: { id: true, nameAsInId: true } })
      : Promise.resolve([]),
    targetIds.length
      ? db.student.findMany({ where: { id: { in: targetIds } }, select: { id: true, user: { select: { nameAsInId: true } } } })
      : Promise.resolve([]),
  ]);
  const proposerName = new Map(proposers.map((p) => [p.id, p.nameAsInId]));
  const targetName = new Map(targets.map((t) => [t.id, t.user.nameAsInId]));

  return rows.map((r) => ({
    id: r.id,
    nameAr: r.nameAr,
    imageUrl: r.imageUrl,
    proposedPricePoints: r.proposedPricePoints,
    targetStudentId: r.targetStudentId,
    targetStudentName: r.targetStudentId ? targetName.get(r.targetStudentId) ?? null : null,
    proposedByName: r.addedByUserId ? proposerName.get(r.addedByUserId) ?? null : null,
    createdAt: r.createdAt,
  }));
}

/** الإدارة تعتمد ثمرة الوليّ: تثبّت القيمة النهائيّة (من المقترحة أو معدَّلة) ← APPROVED. */
export async function approveGuardianGift(
  actorId: string,
  itemId: string,
  finalPricePoints: number,
  db: PrismaClient = prisma,
) {
  await assertMarketAdmin(actorId, db);
  if (!Number.isInteger(finalPricePoints) || finalPricePoints < 1) {
    throw new ValidationError("القيمة المعتمَدة عددٌ صحيحٌ موجب (١ فأكثر).");
  }
  const existing = await db.marketItem.findUnique({
    where: { id: itemId },
    select: { id: true, approvalStatus: true },
  });
  if (!existing) throw new ValidationError("ثمرة غير موجودة.");
  if (existing.approvalStatus !== MarketItemApproval.PENDING) {
    throw new ValidationError("لا تُعتمَد إلّا ثمرةٌ بانتظار الموافقة.");
  }
  const item = await db.marketItem.update({
    where: { id: itemId },
    data: { pricePoints: finalPricePoints, approvalStatus: MarketItemApproval.APPROVED },
  });
  await emitEvent(db, {
    type: "GUARDIAN_GIFT_APPROVED",
    subjectType: "MarketItem",
    subjectId: item.id,
    actorId,
    payload: { pricePoints: finalPricePoints },
  });
  return item;
}

/** الإدارة ترفض ثمرة الوليّ ← REJECTED (لا تُعرَض ولا تُجنى). */
export async function rejectGuardianGift(
  actorId: string,
  itemId: string,
  db: PrismaClient = prisma,
) {
  await assertMarketAdmin(actorId, db);
  const existing = await db.marketItem.findUnique({
    where: { id: itemId },
    select: { id: true, approvalStatus: true },
  });
  if (!existing) throw new ValidationError("ثمرة غير موجودة.");
  if (existing.approvalStatus !== MarketItemApproval.PENDING) {
    throw new ValidationError("لا تُرفَض إلّا ثمرةٌ بانتظار الموافقة.");
  }
  const item = await db.marketItem.update({
    where: { id: itemId },
    data: { approvalStatus: MarketItemApproval.REJECTED },
  });
  await emitEvent(db, {
    type: "GUARDIAN_GIFT_REJECTED",
    subjectType: "MarketItem",
    subjectId: item.id,
    actorId,
  });
  return item;
}
