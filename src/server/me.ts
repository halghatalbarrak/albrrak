import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// صفحة المستخدم عن نفسه — بلا رقم هوية، بلا بيانات غيره.
export interface MyPage {
  userId: string;
  name: string;
  roles: string[];
  student: { id: string; state: string } | null;
}

export async function getMyPage(
  userId: string,
  db: PrismaClient = prisma,
): Promise<MyPage> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      nameAsInId: true,
      roles: true,
      student: { select: { id: true, state: true } },
    },
  });
  return {
    userId: user.id,
    name: user.nameAsInId,
    roles: user.roles,
    student: user.student
      ? { id: user.student.id, state: user.student.state }
      : null,
  };
}
