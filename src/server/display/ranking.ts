import { type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ═══════════════ ترتيب الطلاب بالنقاط (ش٢) ═══════════════
//
// النقاط = الرصيد الإجماليّ من الحصاد (SUM(PointTransaction.amount)) — فالنقاط لا تُنسَب إلى برنامجٍ
// بنظافة (لا programId على PointTransaction، والمنح اليدويّ بلا حدث). المشاركون = أصحاب الالتحاق
// النشط (endedAt=null) في البرنامج/الحلقة، المُفعَّلون (user.isActive). المعطَّلون وغير الملتحقين
// لا يظهرون. من لا حركةَ له = صفر (يظهر). الترتيب تنازليٌّ بالنقاط ثمّ بالاسم.

export interface RankRow { studentId: string; name: string; points: number }

async function rankBy(filter: Prisma.EnrollmentWhereInput, db: PrismaClient, limit?: number): Promise<RankRow[]> {
  const enrolls = await db.enrollment.findMany({
    where: { endedAt: null, ...filter, student: { user: { isActive: true } } },
    select: { studentId: true, student: { select: { user: { select: { nameAsInId: true } } } } },
  });
  const ids = enrolls.map((e) => e.studentId);
  if (!ids.length) return [];
  const sums = await db.pointTransaction.groupBy({ by: ["studentId"], where: { studentId: { in: ids } }, _sum: { amount: true } });
  const pts = new Map(sums.map((s) => [s.studentId, s._sum.amount ?? 0]));
  const rows = enrolls.map((e) => ({ studentId: e.studentId, name: e.student.user.nameAsInId, points: pts.get(e.studentId) ?? 0 }));
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ar"));
  return limit != null ? rows.slice(0, limit) : rows;
}

/** ترتيب كل مشاركي برنامجٍ (كاملاً) بالرصيد الإجماليّ. */
export function rankProgram(programId: string, db: PrismaClient = prisma): Promise<RankRow[]> {
  return rankBy({ programId }, db);
}

/** ترتيب مشاركي حلقةٍ (كاملاً — القاطع يُقصّه المستدعي). */
export function rankCircle(circleId: string, db: PrismaClient = prisma): Promise<RankRow[]> {
  return rankBy({ circleId }, db);
}
