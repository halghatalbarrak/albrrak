import {
  ApplicationStatus,
  type Gender,
  type PrismaClient,
  Role,
  StudentState,
} from "@prisma/client";
import { accountPolicy, computeAge } from "./age-policy";
import { findOrCreateGuardian, provisionStudentLogin } from "./account";
import { emitEvent } from "./events";
import { encryptNationalId } from "./national-id";
import { ValidationError } from "./errors";

// نموذج القيد ← القبول/الرفض/الانتظار ← إنشاء الحساب ← ربط الولي (§٥، §٦).

export interface ApplicationInput {
  nameAsInId: string;
  /** رقم الهوية الصريح — يُشفَّر هنا قبل أن يمسّ القاعدة (م٥). */
  nationalId: string;
  nationalityId: string;
  birthDate: Date;
  gender: Gender;
  schoolStageId?: string | null;
  guardianPhone: string;
  studentPhone?: string | null;
  priorHifzJuz?: number | null;
  priorHifzNotes?: string | null;
  preferredCircleId?: string | null;
}

/** القيد العام — يُستدعى من Route Handler (لا anon insert). يُشفّر الهوية. */
export async function submitApplication(db: PrismaClient, input: ApplicationInput) {
  const nationalIdEnc = encryptNationalId(input.nationalId);
  return db.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        nameAsInId: input.nameAsInId,
        nationalIdEnc,
        nationalityId: input.nationalityId,
        birthDate: input.birthDate,
        gender: input.gender,
        schoolStageId: input.schoolStageId ?? null,
        guardianPhone: input.guardianPhone,
        studentPhone: input.studentPhone ?? null,
        priorHifzJuz: input.priorHifzJuz ?? null,
        priorHifzNotes: input.priorHifzNotes ?? null,
        preferredCircleId: input.preferredCircleId ?? null,
        status: ApplicationStatus.PENDING,
      },
    });
    await emitEvent(tx, {
      type: "APPLICATION_SUBMITTED",
      subjectType: "Application",
      subjectId: app.id,
    });
    return app;
  });
}

export interface AcceptResult {
  userId: string;
  studentId: string;
  guardianLinked: boolean;
  createdStudentLogin: boolean;
}

/**
 * قبول القيد: يُنشئ سجلّ الشخص (User) دائمًا، وحساب دخول للطالب إن بلغ ١٣ (م٤)،
 * ويربط الولي بحكم الولاية لمن دون ١٨. القيد سجلٌّ ثابت لا يُحذف.
 */
export async function acceptApplication(
  db: PrismaClient,
  args: { applicationId: string; decidedBy: string; asOf?: Date },
): Promise<AcceptResult> {
  const asOf = args.asOf ?? new Date();
  return db.$transaction(async (tx) => {
    const app = await tx.application.findUniqueOrThrow({
      where: { id: args.applicationId },
    });
    if (
      app.status !== ApplicationStatus.PENDING &&
      app.status !== ApplicationStatus.WAITLISTED
    ) {
      throw new ValidationError("لا يُقبل إلا طلبٌ معلّق أو في قائمة الانتظار.");
    }

    const age = computeAge(app.birthDate, asOf);
    const policy = accountPolicy(age);
    const nat = await tx.nationality.findUniqueOrThrow({
      where: { id: app.nationalityId },
    });

    // سجلّ الشخص — دائمًا. البريد يُضاف فقط عند إنشاء الدخول (≥١٣).
    const user = await tx.user.create({
      data: {
        nameAsInId: app.nameAsInId,
        nationalId: app.nationalIdEnc, // النص المشفّر يُحمل كما هو
        nationality: nat.nameAr,
        birthDate: app.birthDate,
        gender: app.gender,
        phone: null,
        roles: [Role.STUDENT],
      },
    });
    const student = await tx.student.create({
      data: {
        userId: user.id,
        // §٥: بعد القبول ← بانتظار اختبار القراءة.
        state: StudentState.AWAITING_READING_TEST,
      },
    });

    let createdStudentLogin = false;
    if (policy.createsStudentAccount) {
      // ≥١٣: حساب دخول للطالب (يحتاج جواله).
      await provisionStudentLogin(tx, {
        userId: user.id,
        age,
        phone: app.studentPhone,
      });
      createdStudentLogin = true;
    }

    let guardianLinked = false;
    if (
      policy.guardianRule === "MANDATORY_NO_ACCOUNT" ||
      policy.guardianRule === "GUARANTEED_BY_WILAYAH"
    ) {
      const guardian = await findOrCreateGuardian(tx, {
        guardianPhone: app.guardianPhone,
      });
      await tx.guardianLink.create({
        data: { guardianId: guardian.id, studentId: student.id },
      });
      guardianLinked = true;
    }
    // ١٨+ (BY_STUDENT_CONSENT): لا ربط تلقائي — يُربط بإذنه لاحقًا.

    await tx.application.update({
      where: { id: app.id },
      data: {
        status: ApplicationStatus.ACCEPTED,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        studentId: student.id,
      },
    });
    await emitEvent(tx, {
      type: "STUDENT_ACCEPTED",
      subjectType: "Student",
      subjectId: student.id,
      actorId: args.decidedBy,
      payload: { age, guardianRule: policy.guardianRule },
    });

    return {
      userId: user.id,
      studentId: student.id,
      guardianLinked,
      createdStudentLogin,
    };
  });
}

/** الرفض — بسبب مكتوب إلزامي (§٦٫٢). القيد يبقى سجلًّا ثابتًا. */
export async function rejectApplication(
  db: PrismaClient,
  args: { applicationId: string; decidedBy: string; note: string },
) {
  if (!args.note?.trim()) {
    throw new ValidationError("الرفض يستلزم سببًا مكتوبًا.");
  }
  return db.$transaction(async (tx) => {
    const app = await tx.application.update({
      where: { id: args.applicationId },
      data: {
        status: ApplicationStatus.REJECTED,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.note.trim(),
      },
    });
    await emitEvent(tx, {
      type: "APPLICATION_REJECTED",
      subjectType: "Application",
      subjectId: app.id,
      actorId: args.decidedBy,
    });
    return app;
  });
}

/** قائمة الانتظار عند امتلاء الحلقات (§٦٫٢). */
export async function waitlistApplication(
  db: PrismaClient,
  args: { applicationId: string; decidedBy: string },
) {
  return db.$transaction(async (tx) => {
    const app = await tx.application.update({
      where: { id: args.applicationId },
      data: {
        status: ApplicationStatus.WAITLISTED,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
      },
    });
    await emitEvent(tx, {
      type: "APPLICATION_WAITLISTED",
      subjectType: "Application",
      subjectId: app.id,
      actorId: args.decidedBy,
    });
    return app;
  });
}
