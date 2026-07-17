import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthorizationError, ValidationError } from "./errors";

// جهة اتصال الطوارئ ليست بياناً إدارياً بل أداةٌ في لحظة اضطرار.
// يراها معلّم الطالب فقط — لطلابه هو، بضغطة صريحة، وبسطرٍ في سجل الاطّلاع.
// لا تظهر في قائمة، ولا في تصدير، ولا لعريف. المعلّم لطالبٍ ليس له ⟵ يُرفض في الخادم.

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string | null;
}

/**
 * هل يُدرّس هذا الفاعلُ هذا الطالبَ الآن؟
 * انتسابٌ نشط للطالب في حلقةٍ، والفاعلُ معلّمٌ نشطٌ فيها. (يستثني العريف/المُسمِّع بنيةً.)
 */
async function teachesStudent(
  db: PrismaClient,
  actorId: string,
  studentId: string,
): Promise<boolean> {
  const link = await db.enrollment.findFirst({
    where: {
      studentId,
      endedAt: null,
      circle: { teachers: { some: { teacherId: actorId, endedAt: null } } },
    },
    select: { id: true },
  });
  return link !== null;
}

/**
 * كشف جهة اتصال الطوارئ لطالب — للمعلّم عن طلابه فقط، بسطرٍ في EmergencyAccessLog.
 * غير معلّمِ الطالب ⟵ AuthorizationError (403). لا يُكتب سطرُ اطّلاعٍ عند الرفض.
 */
export async function revealEmergencyContact(
  args: { actorId: string; studentId: string },
  db: PrismaClient = prisma,
): Promise<EmergencyContact> {
  if (!(await teachesStudent(db, args.actorId, args.studentId))) {
    throw new AuthorizationError(
      "جهة الطوارئ تُكشف لمعلّم الطالب فقط — ولستَ معلّمه.",
    );
  }

  const student = await db.student.findUniqueOrThrow({
    where: { id: args.studentId },
    select: {
      emergencyName: true,
      emergencyPhone: true,
      emergencyRelation: { select: { nameAr: true } },
    },
  });
  if (!student.emergencyName || !student.emergencyPhone) {
    throw new ValidationError("لا جهة اتصال طوارئ مسجّلة لهذا الطالب.");
  }

  await db.emergencyAccessLog.create({
    data: { studentId: args.studentId, viewerId: args.actorId },
  });

  return {
    name: student.emergencyName,
    phone: student.emergencyPhone,
    relation: student.emergencyRelation?.nameAr ?? null,
  };
}
