import {
  AutoEventType,
  PointGrantSource,
  PointLimitPeriod,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";

// ═══════════════ الاقتصاد — بنود النقاط (م٦أ) ═══════════════
//
// ECONOMY_RULES.md الركن ١. **القواعد المطلقة في الخادم لا الواجهة** (DESIGN §٢):
//   • البند المعطَّل لا يُمنح.
//   • المانح يملك صلاحية مصدر البند: TEACHER يمنح بند المعلّم فقط، ADMIN للإدارة،
//     وبند AUTO لا يُمنح يدويًّا مطلقًا (منح النظام مؤجَّلٌ لـم٦أ-٢).
//   • المعلّم يمنح لطلاب حلقته فقط (نفس نمط حماية الحضور assertCanRecordCircle §٣٫٢).
//   • حدّ التكرار لكلّ بندٍ في فترته لا يُتجاوَز.
//
// الرصيد **مشتقٌّ** من مجموع الحركات (SUM(amount)) لا عمودٌ مخزَّن — الدفتر مصدر الحقيقة
// الوحيد. وحركة المنح تحفظ amount وgrantSource **لقطةً تاريخيّة** وقت العملية، فتعديل
// البند لاحقًا لا يُعيد كتابة الماضي.

const ADMIN_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

function isAdmin(roles: Role[]): boolean {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

/** يرمي AuthorizationError إن لم يكن الفاعل من كادر الإدارة (المشرف/المدير). */
async function assertAdmin(actorId: string, db: PrismaClient): Promise<Role[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!isAdmin(actor.roles)) {
    throw new AuthorizationError("إدارة بنود النقاط للإدارة وحدها (ECONOMY_RULES الركن ١).");
  }
  return actor.roles;
}

// ═══════════════ إدارة البنود (CRUD — للإدارة، لا حذف) ═══════════════

export interface PointItemInput {
  nameAr: string;
  value: number;
  grantSource: PointGrantSource;
  limitCount?: number | null;
  limitPeriod?: PointLimitPeriod;
  /** لبنود AUTO فقط: نوع الحدث المربوط (م٦أ-٢). إلزاميٌّ مع AUTO، مُهمَلٌ مع غيره. */
  eventType?: AutoEventType | null;
}

/** يتحقّق من صحّة حقول البند (القيمة عددٌ صحيحٌ غير صفر، والحدّ متّسقٌ مع الفترة). */
function validateItemInput(input: PointItemInput): {
  nameAr: string;
  value: number;
  grantSource: PointGrantSource;
  limitPeriod: PointLimitPeriod;
  limitCount: number | null;
  eventType: AutoEventType | null;
} {
  const nameAr = input.nameAr?.trim();
  if (!nameAr) throw new ValidationError("اسم البند مطلوب.");
  if (!Number.isInteger(input.value) || input.value === 0) {
    throw new ValidationError("قيمة البند عددٌ صحيحٌ غير صفر (موجب كسب، سالب خصم).");
  }
  if (!Object.values(PointGrantSource).includes(input.grantSource)) {
    throw new ValidationError("مصدر منحٍ غير معروف.");
  }
  const limitPeriod = input.limitPeriod ?? PointLimitPeriod.NONE;
  if (!Object.values(PointLimitPeriod).includes(limitPeriod)) {
    throw new ValidationError("فترة حدٍّ غير معروفة.");
  }
  // الحدّ عددٌ موجبٌ حين تُحدَّد فترة؛ ومع NONE لا حدّ (يُهمَل العدد).
  let limitCount: number | null = null;
  if (limitPeriod !== PointLimitPeriod.NONE) {
    if (input.limitCount == null || !Number.isInteger(input.limitCount) || input.limitCount < 1) {
      throw new ValidationError("مع تحديد فترة الحدّ، العدد صحيحٌ موجب (١ فأكثر).");
    }
    limitCount = input.limitCount;
  }
  // نوع الحدث: إلزاميٌّ لبنود AUTO (م٦أ-٢)، ويُهمَل لغيرها.
  let eventType: AutoEventType | null = null;
  if (input.grantSource === PointGrantSource.AUTO) {
    if (!input.eventType || !Object.values(AutoEventType).includes(input.eventType)) {
      throw new ValidationError("بند تلقائيّ (AUTO) يلزمه نوع حدثٍ للربط.");
    }
    eventType = input.eventType;
  }
  return { nameAr, value: input.value, grantSource: input.grantSource, limitPeriod, limitCount, eventType };
}

/**
 * يزامن قاعدة الربط التلقائيّ (AutoGrantRule) مع حالة البند:
 *   • مصدره AUTO ⟵ يربطه بنوع الحدث (قاعدةٌ مفعّلة)، بعد التأكّد أنّ الحدث غير مربوطٍ ببندٍ
 *     مفعّلٍ آخر (حدثٌ واحدٌ لبندٍ مفعّلٍ واحد — يمنع ازدواج القواعد).
 *   • مصدره غير AUTO ⟵ يعطّل أيّ قاعدةٍ سابقةٍ لهذا البند (تحوّلٌ من AUTO لغيره).
 */
async function syncAutoRule(
  db: PrismaClient | Prisma.TransactionClient,
  pointItemId: string,
  grantSource: PointGrantSource,
  eventType: AutoEventType | null,
): Promise<void> {
  if (grantSource !== PointGrantSource.AUTO || eventType == null) {
    await db.autoGrantRule.updateMany({ where: { pointItemId }, data: { active: false } });
    return;
  }
  const conflict = await db.autoGrantRule.findFirst({
    where: { eventType, active: true, pointItemId: { not: pointItemId } },
    select: { id: true },
  });
  if (conflict) {
    throw new ValidationError("هذا الحدث مربوطٌ ببندٍ مفعّلٍ آخر — عطّله أوّلاً.");
  }
  await db.autoGrantRule.upsert({
    where: { pointItemId },
    update: { eventType, active: true },
    create: { pointItemId, eventType, active: true },
  });
}

export async function createPointItem(
  actorId: string,
  input: PointItemInput,
  db: PrismaClient = prisma,
) {
  await assertAdmin(actorId, db);
  const { eventType, ...data } = validateItemInput(input);
  return db.$transaction(async (tx) => {
    const item = await tx.pointItem.create({ data });
    await syncAutoRule(tx, item.id, item.grantSource, eventType);
    await emitEvent(tx, {
      type: "POINT_ITEM_CREATED",
      subjectType: "PointItem",
      subjectId: item.id,
      actorId,
      payload: { nameAr: item.nameAr, value: item.value, grantSource: item.grantSource },
    });
    return item;
  });
}

export async function updatePointItem(
  actorId: string,
  itemId: string,
  input: PointItemInput,
  db: PrismaClient = prisma,
) {
  await assertAdmin(actorId, db);
  const existing = await db.pointItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!existing) throw new ValidationError("بند غير موجود.");
  const { eventType, ...data } = validateItemInput(input);
  return db.$transaction(async (tx) => {
    const item = await tx.pointItem.update({ where: { id: itemId }, data });
    await syncAutoRule(tx, item.id, item.grantSource, eventType);
    await emitEvent(tx, {
      type: "POINT_ITEM_UPDATED",
      subjectType: "PointItem",
      subjectId: item.id,
      actorId,
      payload: { value: item.value, grantSource: item.grantSource },
    });
    return item;
  });
}

/** تعطيل/تفعيل بند — لا حذف (ECONOMY_RULES الركن ١). */
export async function setPointItemActive(
  actorId: string,
  itemId: string,
  active: boolean,
  db: PrismaClient = prisma,
) {
  await assertAdmin(actorId, db);
  const existing = await db.pointItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!existing) throw new ValidationError("بند غير موجود.");
  return db.$transaction(async (tx) => {
    const item = await tx.pointItem.update({ where: { id: itemId }, data: { active } });
    // تعطيل/تفعيل البند يُرافقه قاعدته التلقائيّة (إن كان AUTO) فلا يمنح بندٌ معطَّل.
    await tx.autoGrantRule.updateMany({ where: { pointItemId: itemId }, data: { active } });
    await emitEvent(tx, {
      type: active ? "POINT_ITEM_ENABLED" : "POINT_ITEM_DISABLED",
      subjectType: "PointItem",
      subjectId: item.id,
      actorId,
    });
    return item;
  });
}

/** بندٌ + نوع الحدث المربوط به (لبنود AUTO) — لعرضه وتعبئة نموذج التعديل في الشاشة. */
export type PointItemWithEvent = Prisma.PointItemGetPayload<Record<string, never>> & {
  eventType: AutoEventType | null;
};

export async function listPointItems(
  actorId: string,
  db: PrismaClient = prisma,
): Promise<PointItemWithEvent[]> {
  await assertAdmin(actorId, db);
  const items = await db.pointItem.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  const rules = await db.autoGrantRule.findMany({
    where: { pointItemId: { in: items.map((i) => i.id) } },
    select: { pointItemId: true, eventType: true },
  });
  const eventByItem = new Map(rules.map((r) => [r.pointItemId, r.eventType]));
  // نوع الحدث يُعرَض لبنود AUTO فقط — بندٌ حُوّل لمصدرٍ يدويّ لا يحمل حدثًا (ولو بقيت قاعدةٌ معطَّلة).
  return items.map((i) => ({
    ...i,
    eventType: i.grantSource === PointGrantSource.AUTO ? eventByItem.get(i.id) ?? null : null,
  }));
}

// ═══════════════ حدود المنح — من يملك مصدر البند، ولطلاب من ═══════════════

/**
 * هل يجوز للفاعل (بأدواره) منح بندٍ بهذا المصدر؟
 *   • AUTO: لا يُمنح يدويًّا مطلقًا (منح النظام مؤجَّلٌ لـم٦أ-٢).
 *   • ADMIN: الإدارة وحدها.
 *   • TEACHER: المعلّم (نطاقه طلاب حلقته — يُتحقَّق منفصلًا) أو الإدارة.
 */
function sourceAllowedForRoles(roles: Role[], source: PointGrantSource): boolean {
  if (source === PointGrantSource.AUTO) return false;
  if (isAdmin(roles)) return true;
  return source === PointGrantSource.TEACHER && roles.includes(Role.TEACHER);
}

/**
 * المعلّم يمنح لطلاب حلقاته فقط (§٣٫٢). المدير/المشرف يمنح لأي طالب (أصل الصلاحية).
 * معلّمٌ يمنح لغير طلابه ← يُرفض في الخادم.
 */
async function assertActorMayGrantToStudent(
  roles: Role[],
  actorId: string,
  studentId: string,
  db: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  if (isAdmin(roles)) return;
  // حلقات الطالب النشطة، وهل الفاعل معلّمٌ فيها؟
  const link = await db.enrollment.findFirst({
    where: {
      studentId,
      endedAt: null,
      circle: { teachers: { some: { teacherId: actorId, endedAt: null } } },
    },
    select: { id: true },
  });
  if (!link) {
    throw new AuthorizationError("المعلّم يمنح لطلاب حلقته فقط (§٣٫٢).");
  }
}

/** بداية نافذة الحدّ (نافذةٌ منزلقة: يوم = آخر ٢٤ ساعة، أسبوع = آخر ٧ أيام). */
function limitWindowStart(period: PointLimitPeriod, now: Date): Date | null {
  if (period === PointLimitPeriod.DAY) return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === PointLimitPeriod.WEEK) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return null; // NONE — بلا نافذة
}

// ═══════════════ المنح اليدويّ ═══════════════

export interface GrantArgs {
  studentId: string;
  pointItemId: string;
  grantedBy: string;
  note?: string;
}

/**
 * يمنح بندًا لطالب (يدويًّا). يتحقّق من كلّ القواعد المطلقة قبل أيّ كتابة:
 * البند مفعّل، والمانح يملك مصدره، وهو من كادر الطالب (للمعلّم)، والحدّ غير متجاوَز.
 * الفحص والكتابة في معاملةٍ واحدة (يمنع تجاوز الحدّ بمنحين متزامنين).
 */
export async function grantPoints(args: GrantArgs, db: PrismaClient = prisma) {
  const actor = await db.user.findUnique({ where: { id: args.grantedBy }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");

  const item = await db.pointItem.findUnique({ where: { id: args.pointItemId } });
  if (!item) throw new ValidationError("بند غير موجود.");
  if (!item.active) throw new ValidationError("البند معطَّل — لا يُمنح.");

  if (!sourceAllowedForRoles(actor.roles, item.grantSource)) {
    if (item.grantSource === PointGrantSource.AUTO) {
      throw new AuthorizationError("بند تلقائيّ — لا يُمنح يدويًّا (منح النظام مؤجَّلٌ لـم٦أ-٢).");
    }
    throw new AuthorizationError("لا تملك صلاحية مصدر هذا البند.");
  }

  const note = args.note?.trim() || null;
  const now = new Date();

  return db.$transaction(async (tx) => {
    await assertActorMayGrantToStudent(actor.roles, args.grantedBy, args.studentId, tx);

    // حدّ التكرار في الفترة — يُحسب داخل المعاملة فلا يتجاوزه منحان متزامنان.
    if (item.limitPeriod !== PointLimitPeriod.NONE && item.limitCount != null) {
      const start = limitWindowStart(item.limitPeriod, now)!;
      const count = await tx.pointTransaction.count({
        where: { studentId: args.studentId, pointItemId: item.id, createdAt: { gte: start } },
      });
      if (count >= item.limitCount) {
        throw new ValidationError("تجاوز حدّ منح هذا البند في فترته.");
      }
    }

    const txn = await tx.pointTransaction.create({
      data: {
        studentId: args.studentId,
        pointItemId: item.id,
        amount: item.value, // لقطة تاريخيّة
        grantSource: item.grantSource,
        grantedByUserId: args.grantedBy,
        note,
      },
    });
    await emitEvent(tx, {
      type: "POINTS_GRANTED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.grantedBy,
      payload: { pointItemId: item.id, amount: item.value },
    });
    return txn;
  });
}

// ═══════════════ المنح التلقائيّ (م٦أ-٢ — تفعيل AUTO) ═══════════════
//
// يُستدعى من محرّكات النظام عند **نقطة النجاح الفعليّة** (تأكيد الحضور، اجتياز الاختبار،
// إتمام الحصاد، الانتقال) — يُمرَّر عميل المعاملة (tx) ليقع المنح داخل معاملة المحرّك نفسها.
// يمنح البند المربوط بنوع الحدث تلقائياً، بشرط:
//   • وجود قاعدةٍ مفعّلة (AutoGrantRule.active) وبندها مفعّل — وإلّا لا منح (صمتًا).
//   • عدم الازدواج: مفتاح (نوع الحدث + المرجع + الطالب) لم يُمنح قبلُ (AutoGrant الفريد).
//   • احترام حدّ البند وفترته (كالمنح اليدويّ) — تجاوزُه يمنع المنح صمتًا.
// **لا أثر رجعيّ:** لا يُستدعى إلّا وقت الحدث؛ لا يبحث في سجلّاتٍ سابقة.
// grantSource=AUTO وgrantedByUserId=null (لقطةٌ تاريخيّة كالمنح اليدويّ).

export async function grantAuto(
  db: PrismaClient | Prisma.TransactionClient,
  eventType: AutoEventType,
  studentId: string,
  sourceRef: string,
): Promise<Prisma.PointTransactionGetPayload<Record<string, never>> | null> {
  // القاعدة المفعّلة المطابقة (active يُرافق تفعيل البند، فيكفي فحصه) وبندها.
  const rule = await db.autoGrantRule.findFirst({
    where: { eventType, active: true },
    orderBy: { createdAt: "desc" },
    select: { pointItemId: true },
  });
  if (!rule) return null;
  const item = await db.pointItem.findUnique({ where: { id: rule.pointItemId } });
  if (!item || !item.active) return null;

  // منع الازدواج: هل مُنح هذا الحدث (بمرجعه) لهذا الطالب قبلُ؟
  const already = await db.autoGrant.findUnique({
    where: { eventType_sourceRef_studentId: { eventType, sourceRef, studentId } },
    select: { id: true },
  });
  if (already) return null;

  // حدّ البند في فترته (نافذةٌ منزلقة) — كالمنح اليدويّ.
  if (item.limitPeriod !== PointLimitPeriod.NONE && item.limitCount != null) {
    const start = limitWindowStart(item.limitPeriod, new Date())!;
    const count = await db.pointTransaction.count({
      where: { studentId, pointItemId: item.id, createdAt: { gte: start } },
    });
    if (count >= item.limitCount) return null;
  }

  const txn = await db.pointTransaction.create({
    data: {
      studentId,
      pointItemId: item.id,
      amount: item.value, // لقطة تاريخيّة
      grantSource: PointGrantSource.AUTO,
      grantedByUserId: null,
      note: null,
    },
  });
  // سطر منع الازدواج — القيد الفريد يصدّ أيّ منحٍ متزامنٍ مكرّرٍ (backstop).
  await db.autoGrant.create({
    data: { eventType, sourceRef, studentId, pointTransactionId: txn.id },
  });
  await emitEvent(db, {
    type: "POINTS_GRANTED_AUTO",
    subjectType: "Student",
    subjectId: studentId,
    actorId: null,
    payload: { pointItemId: item.id, amount: item.value, eventType, sourceRef },
  });
  return txn;
}

// ═══════════════ الرصيد والدفتر (مشتقّان من الحركات) ═══════════════

/** رصيد الطالب = مجموع حركاته (لا عمود مخزّن). صفرٌ إن لا حركات. */
export async function getBalance(studentId: string, db: PrismaClient = prisma): Promise<number> {
  const agg = await db.pointTransaction.aggregate({
    where: { studentId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export interface LedgerRow {
  id: string;
  itemName: string;
  amount: number;
  grantSource: PointGrantSource;
  grantedByName: string | null;
  note: string | null;
  createdAt: Date;
}

export interface StudentLedger {
  balance: number;
  transactions: LedgerRow[];
}

/** رصيد الطالب + سجلّ حركاته (الأحدث أولًا) — لعرضه في صفحته وشاشة المعلّم. */
export async function getStudentLedger(
  studentId: string,
  db: PrismaClient = prisma,
  limit = 50,
): Promise<StudentLedger> {
  const rows = await db.pointTransaction.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // أسماء البنود والمانحين (بلا FK — نجمعها استعلامًا واحدًا لكلٍّ).
  const itemIds = [...new Set(rows.map((r) => r.pointItemId))];
  const granterIds = [...new Set(rows.map((r) => r.grantedByUserId).filter((x): x is string => !!x))];
  const [items, granters] = await Promise.all([
    itemIds.length
      ? db.pointItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, nameAr: true } })
      : Promise.resolve([]),
    granterIds.length
      ? db.user.findMany({ where: { id: { in: granterIds } }, select: { id: true, nameAsInId: true } })
      : Promise.resolve([]),
  ]);
  const itemName = new Map(items.map((i) => [i.id, i.nameAr]));
  const granterName = new Map(granters.map((g) => [g.id, g.nameAsInId]));

  return {
    balance: await getBalance(studentId, db),
    transactions: rows.map((r) => ({
      id: r.id,
      itemName: itemName.get(r.pointItemId) ?? "—",
      amount: r.amount,
      grantSource: r.grantSource,
      grantedByName: r.grantedByUserId ? granterName.get(r.grantedByUserId) ?? null : null,
      note: r.note,
      createdAt: r.createdAt,
    })),
  };
}

// ═══════════════ عرضٌ لشاشة المعلّم ═══════════════

export interface GrantableItem {
  id: string;
  nameAr: string;
  value: number;
  grantSource: PointGrantSource;
}

/** البنود التي يحقّ للفاعل منحها يدويًّا: المفعّلة، ومصدرها مسموحٌ لأدواره (بلا AUTO). */
export async function listGrantableItems(
  actorId: string,
  db: PrismaClient = prisma,
): Promise<GrantableItem[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) return [];
  const items = await db.pointItem.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, nameAr: true, value: true, grantSource: true },
  });
  return items.filter((i) => sourceAllowedForRoles(actor.roles, i.grantSource));
}

/** رصيد الطالب صاحب الحساب + دفتره — لصفحته «صفحتي». null إن لم يكن الحساب طالبًا. */
export async function getMyLedger(
  userId: string,
  db: PrismaClient = prisma,
): Promise<StudentLedger | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { student: { select: { id: true } } } });
  if (!user?.student) return null;
  return getStudentLedger(user.student.id, db);
}

/**
 * دفتر طالبٍ لفاعلٍ (شاشة المعلّم): المدير/المشرف أيّ طالب، والمعلّم طلاب حلقته فقط.
 * نفس نطاق حماية المنح — فلا يطّلع معلّمٌ على دفتر طالبٍ ليس من حلقته.
 */
export async function getLedgerForActor(
  actorId: string,
  studentId: string,
  db: PrismaClient = prisma,
): Promise<StudentLedger> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  await assertActorMayGrantToStudent(actor.roles, actorId, studentId, db);
  return getStudentLedger(studentId, db);
}

export interface GrantableStudent {
  studentId: string;
  name: string;
  circleName: string;
}

/**
 * الطلاب الذين يحقّ للفاعل منحهم: المعلّم طلاب حلقاته النشطة، والمدير/المشرف كلّ الطلاب.
 * (نفس نطاق حماية الحضور — يمنع المعلّم من منح غير طلابه من الأساس في الواجهة أيضًا.)
 */
export async function listGrantableStudents(
  actorId: string,
  db: PrismaClient = prisma,
): Promise<GrantableStudent[]> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) return [];

  const where: Prisma.EnrollmentWhereInput = isAdmin(actor.roles)
    ? { endedAt: null }
    : { endedAt: null, circle: { teachers: { some: { teacherId: actorId, endedAt: null } } } };

  const enrollments = await db.enrollment.findMany({
    where,
    select: {
      student: { select: { id: true, user: { select: { nameAsInId: true } } } },
      circle: { select: { nameAr: true } },
    },
  });
  return enrollments
    .map((e) => ({
      studentId: e.student.id,
      name: e.student.user.nameAsInId,
      circleName: e.circle.nameAr,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
