import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// عرضٌ آمن للطلاب — **بلا رقم الهوية** (م٥: لا يظهر في تقرير).
// من يحتاج الرقم الصريح يمرّ عبر readNationalId (مخوّل + مُسجَّل).
export interface StudentListItem {
  id: string;
  state: string;
  name: string;
  gender: string;
}

export async function listStudentsSafe(
  db: PrismaClient = prisma,
): Promise<StudentListItem[]> {
  const rows = await db.student.findMany({
    select: {
      id: true,
      state: true,
      user: { select: { nameAsInId: true, gender: true } },
    },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    name: r.user.nameAsInId,
    gender: r.user.gender,
  }));
}
