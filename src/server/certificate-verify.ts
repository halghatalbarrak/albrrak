import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "./errors";

const STAFF = ["TEACHER", "CIRCLE_MANAGER", "SUPER_ADMIN", "REGISTRAR"];

/** من يرى صورة الشهادة: الكادر · الطالب صاحبها · وليّه المرتبط. غيرهم ⟵ يُرفض. */
export async function assertCanViewCertificate(actorId: string, roles: string[], certId: string, db: PrismaClient = prisma): Promise<void> {
  if (roles.some((r) => STAFF.includes(r))) return;
  const c = await db.certificate.findUnique({ where: { id: certId }, select: { studentId: true, student: { select: { userId: true } } } });
  if (!c) throw new AuthorizationError("شهادةٌ غير موجودة.");
  if (c.student.userId === actorId) return;
  const link = await db.guardianLink.findFirst({ where: { guardianId: actorId, studentId: c.studentId, status: "ACTIVE" }, select: { id: true } });
  if (!link) throw new AuthorizationError("لا تَرى إلا شهاداتك أو شهادات أبنائك.");
}

// تحقّقُ الشهادة (الفكرة ١٠) — وحدةٌ خفيفةٌ بلا اعتماد المولّد الثقيل، لصفحةٍ عامّة.
// تكشف الحدّ الأدنى فقط (قرار محمد): الاسم · النوع · تاريخ الإصدار · المرتبة · الجهة.
// لا هوية، لا جوّال، لا تفاصيل تعلّم.

const TYPE_AR: Record<string, string> = {
  KHATM: "شهادة ختم القرآن الكريم",
  MAIN_STAGE: "شهادة إتمام مرحلة",
  SUB_STAGE: "شهادة إتمام حزب",
  QAIDAH: "شهادة القاعدة المدنية",
};

export interface PublicCertificate {
  valid: boolean;        // صحيحةٌ وغير مُبطَلة
  revoked: boolean;
  recipientName: string; // الاسم كاملاً (قرار محمد)
  type: string;
  issuedAt: string;      // ISO YYYY-MM-DD (تُعرض هجرياً في الصفحة)
  excellent: boolean;    // مرتبة التميّز إن وُجدت
  issuer: string;
}

/** يجد شهادةً برمز التوثيق العشوائيّ ويعيد بياناتها العامّة فقط (أو null إن لم تُعرف). */
export async function getPublicCertificate(token: string, db: PrismaClient = prisma): Promise<PublicCertificate | null> {
  if (!token || token.length < 6) return null;
  const c = await db.certificate.findUnique({
    where: { verifyToken: token },
    select: { template: true, isExcellent: true, issuedAt: true, revokedAt: true, student: { select: { user: { select: { nameAsInId: true } } } } },
  });
  if (!c) return null;
  return {
    valid: c.revokedAt == null,
    revoked: c.revokedAt != null,
    recipientName: c.student.user.nameAsInId,
    type: TYPE_AR[c.template] ?? c.template,
    issuedAt: c.issuedAt.toISOString().slice(0, 10),
    excellent: c.isExcellent,
    issuer: "حلقات الشيخ محمد البراك",
  };
}
