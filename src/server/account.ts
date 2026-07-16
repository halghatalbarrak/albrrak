import { type Gender, type Prisma, type PrismaClient, Role } from "@prisma/client";
import { AuthorizationError, ValidationError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

// حيلة المصادقة (BUILD_PLAN §٠): الجوال ← بريد اصطناعي داخلي.
// «الحساب = إمكان الدخول». دون ١٣ لا دخول له (م٤) وإن كان له سجلّ User.
export function syntheticEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    throw new ValidationError("رقم جوال غير صالح لإنشاء الحساب.");
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
): Promise<void> {
  if (args.age < 13) {
    throw new AuthorizationError(
      "م٤: لا يُنشأ حساب دخول لمن دون الثالثة عشرة.",
    );
  }
  if (!args.phone) {
    throw new ValidationError("إنشاء الحساب يحتاج رقم جوال.");
  }
  await db.user.update({
    where: { id: args.userId },
    data: { email: syntheticEmail(args.phone), phone: args.phone },
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
  const email = syntheticEmail(args.guardianPhone);
  const existing = await db.user.findUnique({
    where: { email },
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
  const created = await db.user.create({
    data: {
      nameAsInId: `ولي أمر (${args.guardianPhone})`,
      gender: args.guardianGender,
      roles: [Role.GUARDIAN],
      email,
      phone: args.guardianPhone,
    },
    select: { id: true },
  });
  return created;
}
