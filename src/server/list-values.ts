import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "./errors";

// إدارة القوائم المرجعية (الجنسية/المرحلة/صفة القرابة) من شاشة المدير:
// إضافة قيمة، وتعطيلها (لا حذف — القيمة قد ترتبط بقيودٍ سابقة). الجدول بلا شاشة = ثابتٌ بخطوات أكثر.

export const LIST_KINDS = ["nationality", "schoolStage", "guardianRelation"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export interface ListItem {
  id: string;
  nameAr: string;
  ordinal: number;
  isActive: boolean;
}
export interface AllLists {
  nationalities: ListItem[];
  schoolStages: ListItem[];
  guardianRelations: ListItem[];
}

const SELECT = { id: true, nameAr: true, ordinal: true, isActive: true } as const;
const ORDER = [{ ordinal: "asc" }, { nameAr: "asc" }] as const;

export function isListKind(v: unknown): v is ListKind {
  return typeof v === "string" && (LIST_KINDS as readonly string[]).includes(v);
}

// المندوبات الثلاثة تتشارك شكل العمليات التي نستعملها؛ نوعٌ بنيويّ أدنى يوحّدها
// (Prisma لا يوحّد المندوبات المتّحدة تلقائيًّا — هذا الالتفاف القياسيّ لذلك).
interface RefDelegate {
  findFirst(a: {
    orderBy: { ordinal: "desc" };
    select: { ordinal: true };
  }): Promise<{ ordinal: number } | null>;
  create(a: { data: { nameAr: string; ordinal: number }; select: typeof SELECT }): Promise<ListItem>;
  update(a: {
    where: { id: string };
    data: { isActive: boolean };
    select: typeof SELECT;
  }): Promise<ListItem>;
}

/** يوحّد الوصول إلى المندوب (delegate) الصحيح حسب نوع القائمة. */
function delegate(db: PrismaClient, kind: ListKind): RefDelegate {
  switch (kind) {
    case "nationality":
      return db.nationality as unknown as RefDelegate;
    case "schoolStage":
      return db.schoolStage as unknown as RefDelegate;
    case "guardianRelation":
      return db.guardianRelation as unknown as RefDelegate;
  }
}

/** كل القيم (بما فيها المعطَّلة) — لعرضها في شاشة المدير. */
export async function listAllReferenceValues(
  db: PrismaClient = prisma,
): Promise<AllLists> {
  const [nationalities, schoolStages, guardianRelations] = await Promise.all([
    db.nationality.findMany({ select: SELECT, orderBy: [...ORDER] }),
    db.schoolStage.findMany({ select: SELECT, orderBy: [...ORDER] }),
    db.guardianRelation.findMany({ select: SELECT, orderBy: [...ORDER] }),
  ]);
  return { nationalities, schoolStages, guardianRelations };
}

/** إضافة قيمة جديدة — ترتيبها بعد الأخيرة. الاسم المكرّر ⟵ ValidationError (لا 500). */
export async function addReferenceValue(
  args: { kind: ListKind; nameAr: string },
  db: PrismaClient = prisma,
): Promise<ListItem> {
  const nameAr = args.nameAr.trim();
  if (!nameAr) throw new ValidationError("الاسم مطلوب.");

  const d = delegate(db, args.kind);
  const last = await d.findFirst({ orderBy: { ordinal: "desc" }, select: { ordinal: true } });
  const ordinal = (last?.ordinal ?? 0) + 1;

  try {
    return await d.create({ data: { nameAr, ordinal }, select: SELECT });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationError("هذه القيمة موجودة مسبقًا.");
    }
    throw e;
  }
}

/** تعطيل/تفعيل قيمة (لا حذف). */
export async function setReferenceValueActive(
  args: { kind: ListKind; id: string; isActive: boolean },
  db: PrismaClient = prisma,
): Promise<ListItem> {
  const d = delegate(db, args.kind);
  try {
    return await d.update({
      where: { id: args.id },
      data: { isActive: args.isActive },
      select: SELECT,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      throw new ValidationError("القيمة غير موجودة.");
    }
    throw e;
  }
}
