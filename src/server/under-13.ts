import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeAge } from "./age-policy";

export interface Under13User {
  id: string;
  name: string;
  birthDate: Date | null;
  age: number | null;
  roles: string[];
  isActive: boolean;
  hasAuthAccount: boolean;
}

/** يُعيد المستخدمين الذين لديهم authId وعمرهم أقل من ١٣. */
export async function listUnder13WithAccounts(
  now: Date = new Date(),
  db: PrismaClient = prisma,
): Promise<Under13User[]> {
  const thirteenYearsAgo = new Date(now);
  thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);

  const candidates = await db.user.findMany({
    where: {
      birthDate: { gt: thirteenYearsAgo },
      authId: { not: null },
      deletedAt: null,
    },
    select: { id: true, nameAsInId: true, birthDate: true, roles: true, isActive: true, authId: true },
    orderBy: { birthDate: "desc" },
  });

  return candidates
    .filter((u) => u.birthDate && computeAge(u.birthDate, now) < 13)
    .map((u) => ({
      id: u.id,
      name: u.nameAsInId,
      birthDate: u.birthDate,
      age: u.birthDate ? computeAge(u.birthDate, now) : null,
      roles: u.roles,
      isActive: u.isActive,
      hasAuthAccount: !!u.authId,
    }));
}
