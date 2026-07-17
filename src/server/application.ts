import {
  ApplicationStatus,
  type Gender,
  type PrismaClient,
  Role,
  StudentState,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountPolicy, computeAge } from "./age-policy";
import { findOrCreateGuardian, syntheticEmail } from "./account";
import { type AuthProvider, defaultAuthProvider } from "./auth-provider";
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
  guardianGender: Gender;
  /** صفة الولي (أب/أخ/…) — قيمة من GuardianRelation. إلزامية. */
  guardianRelationId: string;
  studentPhone?: string | null;
  /** جهة اتصال الطوارئ — إلزامية (اسم + جوال + صفة). */
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationId: string;
  priorHifzJuz?: number | null;
  priorHifzNotes?: string | null;
  preferredCircleId?: string | null;
}

/** القيد العام — يُستدعى من Route Handler (لا anon insert). يُشفّر الهوية. */
export async function submitApplication(
  input: ApplicationInput,
  db: PrismaClient = prisma,
) {
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
        guardianGender: input.guardianGender,
        guardianRelationId: input.guardianRelationId,
        studentPhone: input.studentPhone ?? null,
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone,
        emergencyRelationId: input.emergencyRelationId,
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
  args: { applicationId: string; decidedBy: string; asOf?: Date },
  db: PrismaClient = prisma,
  provider: AuthProvider = defaultAuthProvider,
): Promise<AcceptResult> {
  const asOf = args.asOf ?? new Date();

  // قراءةٌ وتحقّقٌ خارج المعاملة — لأن إنشاء المصادقة (شبكة) لا يجوز داخلها.
  const app = await db.application.findUniqueOrThrow({
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

  // ≥١٣: إنشاء مستخدم المصادقة (خارج المعاملة). دون ١٣ ⟵ لا authId (م٤ بنيةً).
  let login: { email: string; phone: string; authId: string } | null = null;
  if (policy.createsStudentAccount) {
    if (!app.studentPhone) {
      throw new ValidationError("طالب ١٣+ يحتاج رقم جواله لإنشاء الحساب.");
    }
    const email = syntheticEmail(app.studentPhone);
    const { authId } = await provider.createAuthUser({
      email,
      phone: app.studentPhone,
    });
    login = { email, phone: app.studentPhone, authId };
  }

  return db.$transaction(async (tx) => {
    // إعادة تحقّق الحالة داخل المعاملة — تفاديًا لقبولٍ مزدوج.
    const fresh = await tx.application.findUniqueOrThrow({
      where: { id: app.id },
      select: { status: true },
    });
    if (
      fresh.status !== ApplicationStatus.PENDING &&
      fresh.status !== ApplicationStatus.WAITLISTED
    ) {
      throw new ValidationError("الطلب حُسم من قبل.");
    }

    const nat = await tx.nationality.findUniqueOrThrow({
      where: { id: app.nationalityId },
    });

    // سجلّ الشخص — دائمًا. البريد/authId فقط عند إنشاء الدخول (≥١٣).
    const user = await tx.user.create({
      data: {
        nameAsInId: app.nameAsInId,
        nationalId: app.nationalIdEnc, // النص المشفّر يُحمل كما هو
        nationality: nat.nameAr,
        birthDate: app.birthDate,
        gender: app.gender,
        email: login?.email ?? null,
        // الجوال يُسجَّل حتى لمن دون ١٣ (فحين يبلغها فالتهيئة نقرة). authId يبقى فارغًا لهم (م٤).
        phone: app.studentPhone ?? null,
        authId: login?.authId ?? null,
        roles: [Role.STUDENT],
      },
    });
    const student = await tx.student.create({
      data: {
        userId: user.id,
        // §٥: بعد القبول ← بانتظار اختبار القراءة.
        state: StudentState.AWAITING_READING_TEST,
        // جهة اتصال الطوارئ تُحمل إلى سجلّ الطالب — يراها معلّمه فقط لاحقًا.
        emergencyName: app.emergencyName,
        emergencyPhone: app.emergencyPhone,
        emergencyRelationId: app.emergencyRelationId,
      },
    });

    const createdStudentLogin = login !== null;

    let guardianLinked = false;
    if (
      policy.guardianRule === "MANDATORY_NO_ACCOUNT" ||
      policy.guardianRule === "GUARANTEED_BY_WILAYAH"
    ) {
      const guardian = await findOrCreateGuardian(tx, {
        guardianPhone: app.guardianPhone,
        guardianGender: app.guardianGender,
      });
      await tx.guardianLink.create({
        data: {
          guardianId: guardian.id,
          studentId: student.id,
          relationId: app.guardianRelationId,
        },
      });
      guardianLinked = true;

      // ١٣–١٧: قاصرٌ نظامًا، جواله عندنا ⟵ يُخطَر وليّه بالقبول (لا يُفاجأ).
      // الإخطار حدثٌ الآن (قاعدة ٥)؛ التسليم الفعلي مع آلية الإشعارات لاحقًا.
      if (policy.guardianRule === "GUARANTEED_BY_WILAYAH") {
        await emitEvent(tx, {
          type: "GUARDIAN_NOTIFIED",
          subjectType: "Student",
          subjectId: student.id,
          actorId: args.decidedBy,
          payload: { guardianId: guardian.id, reason: "MINOR_ACCEPTED", age },
        });
      }
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
    // حدث القيد (قاعدة ٥ + §٦): الإشعارات تشتري منه متى بُنيت.
    await emitEvent(tx, {
      type: "APPLICATION_ACCEPTED",
      subjectType: "Application",
      subjectId: app.id,
      actorId: args.decidedBy,
    });

    return {
      userId: user.id,
      studentId: student.id,
      guardianLinked,
      createdStudentLogin,
    };
  });
}

export interface ReviewRow {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  nationality: string;
  schoolStage: string | null;
  guardianPhone: string;
  studentPhone: string | null;
  priorHifzJuz: number | null;
  status: ApplicationStatus;
  createdAt: Date;
}

/**
 * الطلبات المعلّقة/المنتظرة للمراجعة — كل سطر يحمل خبره كاملاً.
 * **بلا رقم الهوية** (م٥). العمر محسوب لا مُخزَّن.
 */
export async function listApplicationsForReview(
  db: PrismaClient = prisma,
  asOf: Date = new Date(),
): Promise<ReviewRow[]> {
  const apps = await db.application.findMany({
    where: {
      status: { in: [ApplicationStatus.PENDING, ApplicationStatus.WAITLISTED] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nameAsInId: true,
      birthDate: true,
      gender: true,
      guardianPhone: true,
      studentPhone: true,
      priorHifzJuz: true,
      status: true,
      createdAt: true,
      nationality: { select: { nameAr: true } },
      schoolStage: { select: { nameAr: true } },
    },
  });
  return apps.map((a) => ({
    id: a.id,
    name: a.nameAsInId,
    age: computeAge(a.birthDate, asOf),
    gender: a.gender,
    nationality: a.nationality.nameAr,
    schoolStage: a.schoolStage?.nameAr ?? null,
    guardianPhone: a.guardianPhone,
    studentPhone: a.studentPhone,
    priorHifzJuz: a.priorHifzJuz,
    status: a.status,
    createdAt: a.createdAt,
  }));
}

export interface PendingSummary {
  /** عدد الطلبات غير المحسومة (PENDING) — عدّاد يظهر في كل شاشة مدير. */
  pending: number;
  /** أقدم طلبٍ معلّق (لتنبيه «معلّق منذ ٣ أيام»)، أو null إن لا معلّق. */
  oldestPendingAt: Date | null;
}

/** ملخّص الطلبات المعلّقة — للعدّاد والتنبيه في لوحة المدير (ثغرة أول طلب). */
export async function countPendingApplications(
  db: PrismaClient = prisma,
): Promise<PendingSummary> {
  const [pending, oldest] = await Promise.all([
    db.application.count({ where: { status: ApplicationStatus.PENDING } }),
    db.application.findFirst({
      where: { status: ApplicationStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  return { pending, oldestPendingAt: oldest?.createdAt ?? null };
}

/** الرفض — بسبب مكتوب إلزامي (§٦٫٢). القيد يبقى سجلًّا ثابتًا. */
export async function rejectApplication(
  args: { applicationId: string; decidedBy: string; note: string },
  db: PrismaClient = prisma,
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
  args: { applicationId: string; decidedBy: string },
  db: PrismaClient = prisma,
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
