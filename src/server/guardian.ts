import { GuardianLinkStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// طلب فكّ ربط الولي (DESIGN §٤): يرفعه الطالب (١٣+)، ينظر فيه المدير، والرفض هو الأصل.
// **لا يظهر للولي إطلاقًا** — لو رآه لانتفت فائدته في الحالة الوحيدة التي وُجد لها.

/** الطالب يرفع طلب فكّ الربط. يُخزَّن السبب في سجلٍّ مغلق، ويُصدَّر حدث. */
export async function requestUnlink(
  args: { guardianLinkId: string; reason: string; requestedByStudentId: string },
  db: PrismaClient = prisma,
) {
  if (!args.reason?.trim()) {
    throw new ValidationError("طلب فكّ الربط يستلزم سببًا مكتوبًا من الطالب.");
  }
  return db.$transaction(async (tx) => {
    const link = await tx.guardianLink.update({
      where: { id: args.guardianLinkId },
      data: {
        status: GuardianLinkStatus.UNLINK_REQUESTED,
        unlinkReason: args.reason.trim(),
      },
    });
    await emitEvent(tx, {
      type: "GUARDIAN_UNLINK_REQUESTED",
      subjectType: "GuardianLink",
      subjectId: link.id,
      actorId: args.requestedByStudentId,
    });
    return link;
  });
}

/** ما يراه الولي عن روابطه — منظورٌ آمن. */
export interface GuardianVisibleLink {
  id: string;
  studentId: string;
  /** الحالة كما يراها الولي: طلب فكّ الربط المعلّق يظهر ACTIVE (مخفيّ عنه). */
  status: "ACTIVE" | "UNLINKED";
}

/**
 * روابط الولي كما يراها هو — **لا تكشف طلب فكّ الربط ولا سببه ولا قرار المدير**.
 * UNLINK_REQUESTED (معلّق) ⟵ يُعرض ACTIVE. حقول الفكّ لا تُرجَع إطلاقًا.
 */
export async function linksVisibleToGuardian(
  guardianId: string,
  db: PrismaClient = prisma,
): Promise<GuardianVisibleLink[]> {
  const links = await db.guardianLink.findMany({
    where: { guardianId },
    select: { id: true, studentId: true, status: true },
  });
  return links.map((l) => ({
    id: l.id,
    studentId: l.studentId,
    status: l.status === GuardianLinkStatus.UNLINKED ? "UNLINKED" : "ACTIVE",
  }));
}
