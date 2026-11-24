/**
 * إضافة طالب كامل الإعداد في معاملة واحدة.
 * الفارق عن quickAddStudent: يُنهي كل موانع getStudentSetupStatus حين يجتاز القراءة.
 */
import {
  Gender,
  ProgramKey,
  ProgramHistoryReason,
  Role,
  StudentState,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeAge } from "./age-policy";
import { findOrCreateGuardian } from "./account";
import { assertCanAddToCircle } from "./add-student";
import { recordProgramEntry } from "./program-placement";
import { assignSupervisor } from "./muddakir-enrollment";
import { ensureMuddakirProfile } from "./muddakir-profile";
import { emitEvent } from "./events";
import { verr } from "./errors";

export type ReadingTestResult = "PASSED" | "FAILED" | "DEFER";

export interface EnrollMaraqiFields {
  kind: "MARAQI";
  startSurah: number;
  startAyah: number;
  trackId: string;
  trackSource: "AUTO_FROM_FRONTIER" | "MANUAL";
  readingTestResult: ReadingTestResult;
}

export interface EnrollQaidahFields {
  kind: "QAIDAH";
  readingTestResult: ReadingTestResult;
}

export interface EnrollMuddakirFields {
  kind: "MUDDAKIR";
  muddakirTrack: 1 | 2 | 3;
  supervisorId?: string;
}

export type ProgramFields = EnrollMaraqiFields | EnrollQaidahFields | EnrollMuddakirFields;

export interface EnrollNewStudentInput {
  nameAsInId: string;
  birthDate: Date;
  gender: Gender;
  guardianPhone: string;
  guardianName?: string;
  circleId: string;
  programId: string;
  programFields: ProgramFields;
  schoolStage?: string;
  studentPhone?: string;
  notes?: string;
}

export interface EnrollNewStudentResult {
  studentId: string;
  userId: string;
  /** true إن وُجد طالبٌ بنفس الاسم في نفس الحلقة (تحذيرٌ فقط، لا حجب). */
  duplicate: boolean;
  /** true إن أُتمّ الإعداد وأُزيلت كل الموانع. */
  setupComplete: boolean;
}

/** يُرجع مفتاح برنامج بمعرّفه، أو null إن لم يُعثر عليه. */
async function programKeyById(programId: string, db: PrismaClient): Promise<ProgramKey | null> {
  const p = await db.program.findUnique({ where: { id: programId }, select: { key: true } });
  return p?.key ?? null;
}

/**
 * يُضيف طالبًا كامل الإعداد: User + Student + Enrollment + GuardianLink
 * + MaraqiPlacement/TrackAssignment (مراقي مجتاز) + MuddakirProfile (مدّكر).
 * المعاملة ذرّيّة — إمّا تنجح جميعها أو لا يُحفظ شيء.
 */
export async function enrollNewStudent(
  actorId: string,
  actorRoles: Role[],
  input: EnrollNewStudentInput,
  db: PrismaClient = prisma,
): Promise<EnrollNewStudentResult> {
  const name = input.nameAsInId.trim();
  if (!name) throw verr("enrollNameRequired");
  if (!input.guardianPhone.trim()) throw verr("quickAddGuardianPhoneRequired");
  if (!input.circleId) throw verr("circleNotFound");
  if (!input.programId) throw verr("programRequired");

  await assertCanAddToCircle(actorId, actorRoles, input.circleId, db);

  const programKey = await programKeyById(input.programId, db);
  if (!programKey) throw verr("programNotFound");

  const age = computeAge(input.birthDate, new Date());

  // م٤: المدّكر لمن عمره ١٣ فأكثر
  if (programKey === ProgramKey.MUDDAKIR && age < 13) throw verr("notYetThirteen");

  // تحقّق من التكرار (تحذيرٌ لا حجب)
  const existingEnr = await db.enrollment.findFirst({
    where: {
      circleId: input.circleId,
      endedAt: null,
      student: { deletedAt: null, user: { nameAsInId: name } },
    },
    select: { studentId: true, student: { select: { id: true, userId: true } } },
  });

  if (existingEnr) {
    return {
      studentId: existingEnr.student.id,
      userId: existingEnr.student.userId,
      duplicate: true,
      setupComplete: false,
    };
  }

  // إيجاد الولي أو إنشاؤه (خارج المعاملة ليُعاد المحاولة بأمان)
  const guardian = await findOrCreateGuardian(db, {
    guardianPhone: input.guardianPhone.trim(),
    guardianGender: input.gender === Gender.FEMALE ? Gender.FEMALE : Gender.MALE,
  });

  // تحديد الحالة الأولى
  const { state, setupComplete } = resolveInitialState(programKey, input.programFields);

  const result = await db.$transaction(async (tx) => {
    // ١. المستخدم
    const user = await tx.user.create({
      data: {
        nameAsInId: name,
        birthDate: input.birthDate,
        gender: input.gender,
        roles: [Role.STUDENT],
        authId: null,
      },
    });

    // ٢. الطالب
    const student = await tx.student.create({
      data: {
        userId: user.id,
        state,
        ...(input.schoolStage ? { schoolStage: input.schoolStage } : {}),
      },
    });

    // ٣. القيد
    await tx.enrollment.create({
      data: { studentId: student.id, circleId: input.circleId, programId: input.programId },
    });

    // ٤. ربط الولي
    await tx.guardianLink.create({
      data: { guardianId: guardian.id, studentId: student.id, status: "ACTIVE" },
    });

    // ٥. تاريخ البرامج
    await recordProgramEntry(tx, {
      studentId: student.id,
      programId: input.programId,
      reason: ProgramHistoryReason.ASSIGNMENT,
      actorId,
    });

    // ٦. الإعداد البرنامجيّ المتخصّص
    if (input.programFields.kind === "MARAQI") {
      const f = input.programFields;
      if (f.readingTestResult === "PASSED") {
        // التسكين (جبهة البداية)
        await tx.maraqiPlacement.create({
          data: {
            studentId: student.id,
            reachedSurah: f.startSurah,
            reachedAyah: f.startAyah,
          },
        });
        // المسار
        await tx.trackAssignment.create({
          data: { studentId: student.id, trackId: f.trackId, reason: f.trackSource },
        });
      }
    } else if (input.programFields.kind === "MUDDAKIR") {
      await ensureMuddakirProfile(tx, student.id);
      const track = input.programFields.muddakirTrack;
      if (track) {
        await tx.muddakirProfile.update({
          where: { studentId: student.id },
          data: { track },
        });
      }
    }

    // ٧. سجلّ التدقيق
    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Student",
        entityId: student.id,
        actorId,
        label: `enroll-new:${input.circleId}:${programKey}`,
      },
    });

    // ٨. حدثٌ للبريد والإشعارات
    await emitEvent(tx, {
      type: "STUDENT_ENROLLED",
      subjectType: "Student",
      subjectId: student.id,
      actorId,
      payload: { circleId: input.circleId, programKey },
    });

    return { studentId: student.id, userId: user.id };
  });

  // ٩. إسناد مشرف المدّكِر (خارج المعاملة لأنّه يحتاج advisory lock خاصّ به)
  if (
    input.programFields.kind === "MUDDAKIR" &&
    input.programFields.supervisorId
  ) {
    try {
      await assignSupervisor(
        { studentId: result.studentId, supervisorId: input.programFields.supervisorId, actorId },
        db,
      );
    } catch {
      // لا نوقف العملية — المشرف يُسند لاحقاً من البطاقة
    }
  }

  return { ...result, duplicate: false, setupComplete };
}

/** يحدّد الحالة الأولى للطالب والإعداد المكتمل بحسب البرنامج ونتيجة الاختبار. */
function resolveInitialState(
  _programKey: ProgramKey,
  fields: ProgramFields,
): { state: StudentState; setupComplete: boolean } {
  if (fields.kind === "MUDDAKIR") {
    // المدّكِر: حافظٌ نشط، لا يمرّ باختبار القراءة
    return { state: StudentState.IN_MARAQI, setupComplete: true };
  }
  if (fields.kind === "MARAQI") {
    if (fields.readingTestResult === "PASSED") {
      return { state: StudentState.IN_MARAQI, setupComplete: true };
    }
    return { state: StudentState.AWAITING_READING_TEST, setupComplete: false };
  }
  if (fields.kind === "QAIDAH") {
    if (fields.readingTestResult === "PASSED") {
      return { state: StudentState.IN_QAIDAH, setupComplete: true };
    }
    return { state: StudentState.AWAITING_READING_TEST, setupComplete: false };
  }
  // برامج أخرى: لا اختبار قراءة (مثل WEEKLY)
  return { state: StudentState.IN_MARAQI, setupComplete: true };
}
