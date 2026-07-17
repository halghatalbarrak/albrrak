import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// قوائم نموذج القيد العام (جنسيات + مراحل دراسية + صفات قرابة) — بيانات مرجعية عامة.
export interface RegistrationOptions {
  nationalities: { id: string; nameAr: string }[];
  schoolStages: { id: string; nameAr: string }[];
  guardianRelations: { id: string; nameAr: string }[];
}

export async function listRegistrationOptions(
  db: PrismaClient = prisma,
): Promise<RegistrationOptions> {
  const [nationalities, schoolStages, guardianRelations] = await Promise.all([
    db.nationality.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
      orderBy: [{ ordinal: "asc" }, { nameAr: "asc" }],
    }),
    db.schoolStage.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
      orderBy: { ordinal: "asc" },
    }),
    db.guardianRelation.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
      orderBy: { ordinal: "asc" },
    }),
  ]);
  return { nationalities, schoolStages, guardianRelations };
}
