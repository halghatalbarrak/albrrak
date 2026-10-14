import { type Gender, type Prisma, type PrismaClient, Role } from "@prisma/client";
import { type AuthProvider, defaultAuthProvider } from "./auth-provider";
import { normalizeSaudiPhone, canonicalEmail, emailVariants } from "@/lib/phone";
import { verr, aerr } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

export { normalizeSaudiPhone } from "@/lib/phone"; // إعادة تصديرٍ للتوافق مع مستورديه من «./account»

// حيلة المصادقة (BUILD_PLAN §٠): الجوال ← بريد اصطناعي داخلي.
// «الحساب = إمكان الدخول». دون ١٣ لا دخول له (م٤) وإن كان له سجلّ User.
// (لا يُوحَّد الجوال هنا عمداً — حفظاً لتطابق الحسابات القائمة المخزّنة بصيغتها؛ توحيد صيغة
//  الكادر يقع في createStaff وحده عبر normalizeSaudiPhone، بلا مساسٍ بالوليّ/الطالب.)
export function syntheticEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    throw verr("phoneInvalidForAccount");
  }
  return `u${digits}@albrrak.app`;
}

/**
 * إنشاء حساب دخول لطالب. م٤: يُرفض في الخادم لمن دون ١٣.
 * يحتاج رقم جوال. يضع البريد الاصطناعي (هوية الدخول) على سجلّ User.
 * (إنشاء auth.users في Supabase يُوصَل لاحقًا؛ هنا نضع هوية الدخول.)
 */
export async function provisionStudentLogin(
  db: Db,
  args: { userId: string; age: number; phone: string | null | undefined },
  provider: AuthProvider = defaultAuthProvider,
): Promise<void> {
  if (args.age < 13) {
    throw aerr("noLoginUnderThirteen");
  }
  if (!args.phone) {
    throw verr("accountNeedsPhone");
  }
  const email = syntheticEmail(args.phone);
  const { authId } = await provider.createAuthUser({ email, phone: args.phone });
  await db.user.update({
    where: { id: args.userId },
    data: { email, phone: args.phone, authId },
  });
}

/**
 * ولي الأمر — النافذة الوحيدة (§٤). حسابٌ واحد لكل جوال (يتشارك الإخوة وليًّا).
 * جنس الولي يأتي من نموذج القيد (Application.guardianGender) — لا عنصر نائب.
 */
export async function findOrCreateGuardian(
  db: Db,
  args: { guardianPhone: string; guardianGender: Gender },
): Promise<{ id: string }> {
  // المقارنة تقبل الصيغتين (الموحّدة والخام) فيُطابَق الوليّ القائم مهما كانت صيغة جواله المخزّنة.
  const existing = await db.user.findFirst({
    where: { email: { in: emailVariants(args.guardianPhone) } },
    select: { id: true, roles: true },
  });
  if (existing) {
    if (!existing.roles.includes(Role.GUARDIAN)) {
      await db.user.update({
        where: { id: existing.id },
        data: { roles: { set: [...existing.roles, Role.GUARDIAN] } },
      });
    }
    return { id: existing.id };
  }
  // حسابٌ جديد ⟵ يُكتب بالصيغة الموحّدة (E.164 للسعوديّ).
  const canon = normalizeSaudiPhone(args.guardianPhone);
  const created = await db.user.create({
    data: {
      nameAsInId: `ولي أمر (${args.guardianPhone})`,
      gender: args.guardianGender,
      roles: [Role.GUARDIAN],
      email: canonicalEmail(args.guardianPhone),
      phone: canon.startsWith("966") ? `+${canon}` : args.guardianPhone,
    },
    select: { id: true },
  });
  return created;
}
