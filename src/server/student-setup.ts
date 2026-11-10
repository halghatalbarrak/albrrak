import { ApprovalKind, ApprovalStatus, GuardianLinkStatus, ProgramKey, StudentState, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { maraqiKey, MARAQI_SURAH_ORDER } from "@/lib/maraqi-order";
import { computeAge } from "./age-policy";

// ═══════════════ حالة إعداد الطالب (لوحة «إعدادات ناقصة») ═══════════════
//
// دالّةٌ واحدة تُرجع قائمتَي الموانع والتنبيهات للطالب. تُعرض اللوحة أعلى بطاقة الطالب
// في الشاشة الموحّدة، وكل خطوة تُنجَز داخلها (لا انتقال لصفحة أخرى).
//
// الموانع (blockers): تقفل الحفظ/الترسيخ/المراجعة وتُحسَب في شارة «يحتاج إعداداً».
// التنبيهات (warnings): تظهر باللون الأصفر، لا تقفل شيئاً، لا تُحسَب في الشارة.

export type SetupBlocker =
  | { key: "NO_PROGRAM" }
  | { key: "READING_TEST"; pendingApprovalId: string | null }
  | { key: "FRONTIER" }
  | { key: "NO_TRACK" };

export type SetupWarning =
  | { key: "NO_GUARDIAN" }
  | { key: "NO_PHONE"; minAge: 13 };

export interface StudentSetupStatus {
  studentId: string;
  /** true إذا كانت قائمة الموانع فارغة (التنبيهات لا تؤثّر على الاكتمال). */
  isComplete: boolean;
  blockers: SetupBlocker[];
  warnings: SetupWarning[];
}

/** هل هذا الطالب في حالةٍ نشطة بمراقي (بعد قبول القراءة)؟ */
function isActiveMaraqi(state: StudentState): boolean {
  return state === StudentState.IN_MARAQI || state === StudentState.AWAITING_PACE_TEST || state === StudentState.PACE_RETEST_SCHEDULED;
}

/**
 * يحسب قائمة الإعدادات الناقصة للطالب بالترتيب:
 * NO_PROGRAM → READING_TEST → FRONTIER → NO_TRACK (موانع)
 * NO_GUARDIAN → NO_PHONE (تنبيهات)
 */
export async function getStudentSetupStatus(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<StudentSetupStatus> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      state: true,
      user: { select: { birthDate: true, phone: true } },
      enrollments: {
        where: { endedAt: null },
        select: { programId: true, program: { select: { key: true } } },
        take: 1,
        orderBy: { startedAt: "desc" },
      },
      trackAssignments: {
        where: { endedAt: null },
        select: { id: true },
        take: 1,
      },
      guardians: {
        where: { status: GuardianLinkStatus.ACTIVE },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!student) return { studentId, isComplete: true, blockers: [], warnings: [] };

  const blockers: SetupBlocker[] = [];
  const warnings: SetupWarning[] = [];

  // ١. NO_PROGRAM — لا انتساب نشط أو بلا برنامج
  const activeEnrollment = student.enrollments[0];
  if (!activeEnrollment || !activeEnrollment.programId) {
    blockers.push({ key: "NO_PROGRAM" });
    return { studentId, isComplete: false, blockers, warnings };
  }

  const programKey = activeEnrollment.program?.key ?? null;
  const isMaraqi = programKey === ProgramKey.MARAQI;

  // ٢. READING_TEST — بانتظار اختبار القراءة أو اعتماده
  if (student.state === StudentState.AWAITING_READING_TEST) {
    const pending = await db.approval.findFirst({
      where: { kind: ApprovalKind.PLACEMENT_DECISION, subjectId: studentId, status: ApprovalStatus.PENDING },
      select: { id: true },
    });
    blockers.push({ key: "READING_TEST", pendingApprovalId: pending?.id ?? null });
    // لا نتحقّق من FRONTIER/NO_TRACK إذ لم يُحدَّد البرنامج بعد
    return { studentId, isComplete: false, blockers, warnings };
  }

  // ٣ و٤. فحوص مراقي فقط (بعد تجاوز اختبار القراءة)
  if (isMaraqi && isActiveMaraqi(student.state)) {
    // ٣. FRONTIER — لم يُسكَّن بعد (لا صفٌّ في MaraqiPlacement)
    const placement = await db.maraqiPlacement.findUnique({
      where: { studentId },
      select: { id: true },
    });
    if (!placement) {
      blockers.push({ key: "FRONTIER" });
    }

    // ٤. NO_TRACK — لا مسار نشط
    if (!student.trackAssignments.length) {
      blockers.push({ key: "NO_TRACK" });
    }
  }

  // التنبيهات (لا تقفل شيئاً)
  const today = new Date();
  const age = student.user.birthDate ? computeAge(student.user.birthDate, today) : null;

  // ٥. NO_GUARDIAN — دون ١٨ وبلا ولي أمر
  if (age !== null && age < 18 && !student.guardians.length) {
    warnings.push({ key: "NO_GUARDIAN" });
  }

  // ٦. NO_PHONE — ١٣+ وبلا جوال
  if (age !== null && age >= 13 && !student.user.phone) {
    warnings.push({ key: "NO_PHONE", minAge: 13 });
  }

  return {
    studentId,
    isComplete: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ─────────── اقتراح المسار ───────────

export interface TrackOption { id: string; nameAr: string; linesPerDay: number; ordinal: number }

export interface TrackSuggestion {
  suggestedTrackId: string | null;
  availableTracks: TrackOption[];
}

/**
 * يقترح مسار مراقي للطالب بناءً على جبهته (MaraqiPlacement أو جلسات الحفظ).
 * يتبع سلّم المسارات من MARAQI_RULES.md القرار ب.
 */
export async function suggestTrackForStudent(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<TrackSuggestion> {
  const program = await db.program.findUnique({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
  if (!program) return { suggestedTrackId: null, availableTracks: [] };

  const tracks = await db.track.findMany({
    where: { programId: program.id, isActive: true },
    orderBy: { ordinal: "asc" },
    select: { id: true, nameAr: true, linesPerDay: true, ordinal: true },
  });
  if (!tracks.length) return { suggestedTrackId: null, availableTracks: [] };

  // جبهة الطالب من التسكين والجلسات
  const [placement, sessions] = await Promise.all([
    db.maraqiPlacement.findUnique({ where: { studentId }, select: { reachedSurah: true, reachedAyah: true } }),
    db.dailySession.findMany({ where: { studentId, hifzToSurah: { not: null } }, select: { hifzToSurah: true, hifzToAyah: true } }),
  ]);

  let fKey: number | null = null;
  if (placement?.reachedSurah != null) {
    fKey = maraqiKey(placement.reachedSurah, placement.reachedAyah ?? 1);
  }
  for (const s of sessions) {
    if (s.hifzToSurah == null) continue;
    const k = maraqiKey(s.hifzToSurah, s.hifzToAyah ?? 1);
    if (fKey === null || k > fKey) fKey = k;
  }

  if (fKey === null) {
    // لا محفوظ → المسار الأبطأ (ordinal=1)
    return { suggestedTrackId: tracks[0].id, availableTracks: tracks };
  }

  // استخراج رقم السورة من مفتاح مراقي
  // maraqiKey = orderIndex * 100_000 + ayah
  // MARAQI_SURAH_ORDER[0]=1, [1]=114, [k]=115-k (k>=1)
  const orderIdx = Math.floor(fKey / 100_000);
  const frontierSurah = orderIdx === 0 ? 1 : MARAQI_SURAH_ORDER[orderIdx] ?? 2;

  // حدود سلّم المسارات من MARAQI_RULES.md القرار ب
  // جبهة ≥ سورة 78 (النبأ): ordinal 1 | ≥ 58 (المجادلة): 2 | ≥ 46 (الأحقاف): 3 | ≥ 29 (العنكبوت): 4 | أبعد: 5
  let targetOrdinal = 5;
  if (frontierSurah >= 78) targetOrdinal = 1;
  else if (frontierSurah >= 58) targetOrdinal = 2;
  else if (frontierSurah >= 46) targetOrdinal = 3;
  else if (frontierSurah >= 29) targetOrdinal = 4;

  const suggested =
    tracks.find((t) => t.ordinal === targetOrdinal) ??
    tracks.find((t) => t.ordinal > targetOrdinal) ??
    tracks[tracks.length - 1];

  return { suggestedTrackId: suggested.id, availableTracks: tracks };
}
