import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeAge } from "./age-policy";
import { provisionStudentLogin } from "./account";
import { type AuthProvider, defaultAuthProvider } from "./auth-provider";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// بلوغ الثالثة عشرة يأتي وحده (قرار محمد): **أهلية لا إنشاء تلقائي**.
// المنصة تُنبّه المُسجِّل «بلغ ١٣ — أتُنشئ حسابًا؟»؛ والإنشاء يحتاج جوالًا
// ويربط الولاية بحكمها (§٤). لا تلقائيًّا: قد لا جوال له بعد، وأبوه يجب أن يعلم.

export interface EligibleStudent {
  studentId: string;
  userId: string;
  age: number;
}

/** طلابٌ بلغوا ١٣ ولا حساب دخول لهم بعد — لتنبيه المُسجِّل. */
export async function studentsReachingAccountEligibility(
  asOf: Date,
  db: PrismaClient = prisma,
): Promise<EligibleStudent[]> {
  const students = await db.student.findMany({
    where: { user: { email: null, birthDate: { not: null } } },
    select: { id: true, userId: true, user: { select: { birthDate: true } } },
  });
  const out: EligibleStudent[] = [];
  for (const s of students) {
    if (!s.user.birthDate) continue;
    const age = computeAge(s.user.birthDate, asOf);
    if (age >= 13) out.push({ studentId: s.id, userId: s.userId, age });
  }
  return out;
}

/**
 * إنشاء حساب لطالبٍ بلغ ١٣ — بفعلٍ صريح من المُسجِّل، لا تلقائيًّا.
 * يحتاج جوالًا، ويضمن ربط الولاية (١٣–١٧).
 */
export async function createAccountForStudentReachingThirteen(
  args: { studentId: string; phone: string; actorId: string; asOf?: Date },
  db: PrismaClient = prisma,
  provider: AuthProvider = defaultAuthProvider,
) {
  const asOf = args.asOf ?? new Date();
  return db.$transaction(async (tx) => {
    const student = await tx.student.findUniqueOrThrow({
      where: { id: args.studentId },
      select: {
        id: true,
        userId: true,
        user: { select: { birthDate: true, email: true } },
      },
    });
    if (!student.user.birthDate) {
      throw new ValidationError("لا تاريخ ميلاد — يتعذّر التحقّق من العمر.");
    }
    const age = computeAge(student.user.birthDate, asOf);
    if (age < 13) {
      throw new ValidationError("لم يبلغ الثالثة عشرة بعد.");
    }

    await provisionStudentLogin(
      tx,
      { userId: student.userId, age, phone: args.phone },
      provider,
    );

    // ملاحظة: الطالب المقبول دون ١٣ سبق أن رُبط بوليّه بحكم الولاية عند القبول،
    // فلا يلزم ربطٌ جديد هنا — يبقى الربط القائم (١٣–١٧ مضمونة §٤).

    await emitEvent(tx, {
      type: "STUDENT_LOGIN_PROVISIONED_ON_ELIGIBILITY",
      subjectType: "Student",
      subjectId: student.id,
      actorId: args.actorId,
      payload: { age },
    });
    return { studentId: student.id, age };
  });
}
