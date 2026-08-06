import {
  ProgramKey,
  Role,
  StageKind,
  StudentState,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { assertCanExamine } from "./examiner-eligibility";
import { emitEvent } from "./events";
import { ValidationError } from "./errors";

// ═══════════════ مراقي — المراحل والمسارات (م٤أ، DESIGN §٨) ═══════════════
//
// طبقتان (§٨٫٢): الورد اليومي بالسورة والآية (الطالب/المعلم)، والمراحل والحصاد بالحزب
// (الإدارة). **الطالب لا يرى كلمة «حزب» أبدًا** — فحقل hizbNumber يُحجب عن غير الكادر.
//
// المسارات (§٨٫٥): سلّمٌ في القاعدة لا في الكود. القاعدة: **أعلى مسارٍ أقلُّ ممّا حفظه**
// في نصف الساعة. أقلّ من ٣ أسطر ← لا مسار (يُعاد اختباره). البنك (اختيار المقطع) مؤجَّل.

/** أقلّ من ٣ أسطر ← لا مسار (§٨٫٥). */
export const MIN_LINES_FOR_TRACK = 3;

export interface TrackLite {
  id: string;
  nameAr: string;
  linesPerDay: number;
  ordinal: number;
}

/**
 * يسند أعلى مسارٍ **أقلَّ** ممّا حفظه الطالب (§٨٫٥). دالّة نقيّة قابلة للاختبار.
 * أقلّ من ٣ أسطر ⟵ null (يُعاد اختباره). أمثلة الوثيقة: صفحة (١٥) ⟵ نصف صفحة (٧٫٥)؛
 * ٥ أسطر ⟵ ٣ أسطر؛ ٥ صفحات (٧٥) ⟵ ٤ صفحات (٦٠).
 */
export function assignTrackFromLines(
  linesMemorized: number,
  tracks: TrackLite[],
): TrackLite | null {
  if (!Number.isFinite(linesMemorized) || linesMemorized < MIN_LINES_FOR_TRACK) {
    return null;
  }
  const below = tracks.filter((t) => t.linesPerDay < linesMemorized);
  if (below.length === 0) return null;
  return below.reduce((max, t) => (t.linesPerDay > max.linesPerDay ? t : max));
}

export interface RecordPaceTestArgs {
  studentId: string;
  administeredBy: string; // المُختبِر — ليس معلمه (م١)
  linesMemorized: number;
}

export interface PaceTestResult {
  assignedTrack: TrackLite | null;
  state: StudentState;
}

/**
 * يسجّل اختبار المقطع (§٨٫٥) ويُسند المسار. **قاعدة مطلقة:** المُختبِر ليس معلم الطالب
 * (م١ — يُتحقَّق في الخادم). المقطع نفسه من البنك مؤجَّل، فـ passageId يبقى فارغًا الآن.
 *   مسارٌ مُسنَد  ⟵ TrackAssignment + IN_MARAQI.
 *   أقلّ من ٣ أسطر ⟵ PACE_RETEST_SCHEDULED (موعد الإعادة إعدادٌ يُحدَّد لاحقًا).
 */
export async function recordPaceTest(
  args: RecordPaceTestArgs,
  db: PrismaClient = prisma,
): Promise<PaceTestResult> {
  if (!Number.isFinite(args.linesMemorized) || args.linesMemorized < 0) {
    throw new ValidationError("قدر الحفظ (بالأسطر) غير صالح.");
  }
  const student = await db.student.findUnique({
    where: { id: args.studentId },
    select: { state: true },
  });
  if (!student) throw new ValidationError("طالب غير موجود.");
  if (student.state !== StudentState.AWAITING_PACE_TEST) {
    throw new ValidationError("اختبار المقطع لا يُسجَّل إلا لطالبٍ بانتظاره.");
  }

  // القاعدة المطلقة: المُختبِر ليس معلمه (م١).
  await assertCanExamine({ examinerUserId: args.administeredBy, studentId: args.studentId }, db);

  const program = await db.program.findUnique({
    where: { key: ProgramKey.MARAQI },
    select: { id: true },
  });
  if (!program) throw new ValidationError("برنامج مراقي غير مبذور.");

  const tracks = await db.track.findMany({
    where: { programId: program.id, isActive: true },
    select: { id: true, nameAr: true, linesPerDay: true, ordinal: true },
    orderBy: { ordinal: "asc" },
  });
  const assigned = assignTrackFromLines(args.linesMemorized, tracks);

  const nextState = assigned ? StudentState.IN_MARAQI : StudentState.PACE_RETEST_SCHEDULED;

  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.paceTest.create({
      data: {
        studentId: args.studentId,
        administeredBy: args.administeredBy,
        startedAt: now,
        endedAt: now,
        linesMemorized: args.linesMemorized,
        assignedTrackId: assigned?.id ?? null,
      },
    });
    if (assigned) {
      await tx.trackAssignment.create({
        data: { studentId: args.studentId, trackId: assigned.id, reason: "PACE_TEST" },
      });
    }
    await tx.student.update({ where: { id: args.studentId }, data: { state: nextState } });
    await emitEvent(tx, {
      type: assigned ? "PACE_TEST_ASSIGNED" : "PACE_RETEST_SCHEDULED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.administeredBy,
      payload: { linesMemorized: args.linesMemorized, trackId: assigned?.id ?? null },
    });
  });

  return { assignedTrack: assigned, state: nextState };
}

// ═══════════════ عرض المراحل — بالسورة والآية، والحزب محجوب عن الطالب ═══════════════

export interface MaraqiSubStage {
  stageId: string;
  ordinal: number; // ترتيب تنازليّ (١ = آخر المصحف)
  label: string; // بالسورة والآية — لا كلمة «حزب»
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  juz: number | null; // جزء الحزب (من HizbBoundary)
  hizb: number | null; // للكادر فقط؛ null للطالب (§٨٫٢)
}

export interface MaraqiMainStage {
  stageId: string;
  ordinal: number;
  nameAr: string;
  subStages: MaraqiSubStage[];
}

export interface MaraqiLadder {
  prelude: { stageId: string; nameAr: string } | null; // الفاتحة (تمهيد، بلا حصاد)
  mainStages: MaraqiMainStage[];
  canSeeHizb: boolean;
}

const STAFF_ROLES: Role[] = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

/**
 * ترتيب حدّ الحزب **في العرض فقط**: مراقي يحفظ داخل الحزب تنازليًّا — من الأصغر (الناس)
 * صعودًا للأكبر (الأعلى). نصّ nameAr مخزَّنٌ بترتيب المصحف «البداية - النهاية»؛ هنا نعكس
 * الطرفين لتطابق اتجاه الحفظ. البيانات المرجعية (nameAr، الحدود، الملف) لا تُمَسّ.
 * آمنٌ لِما لا حدّ فيه (بلا « - » ⟵ يُترك كما هو، كاسم المرحلة الأصلية).
 */
export function displayBoundary(nameAr: string): string {
  const parts = nameAr.split(" - ");
  return parts.length === 2 ? `${parts[1]} - ${parts[0]}` : nameAr;
}

/**
 * سلّم مراقي للعارض: المراحل الأصلية وتحتها الفرعية بالسورة والآية. رقم الحزب يُحجب
 * عمّن ليس كادرًا (§٨٫٢: الطالب لا يرى «حزب»). فارغٌ بأمان قبل البذر.
 */
export async function getMaraqiLadder(
  viewer: { roles: Role[] },
  db: PrismaClient = prisma,
): Promise<MaraqiLadder> {
  const program = await db.program.findUnique({
    where: { key: ProgramKey.MARAQI },
    select: { id: true },
  });
  if (!program) return { prelude: null, mainStages: [], canSeeHizb: false };

  const canSeeHizb = viewer.roles.some((r) => STAFF_ROLES.includes(r));

  const stages = await db.stage.findMany({
    where: { programId: program.id },
    orderBy: { ordinal: "asc" },
    select: {
      id: true,
      kind: true,
      ordinal: true,
      nameAr: true,
      parentId: true,
      hizbNumber: true,
      fromSurah: true,
      fromAyah: true,
      toSurah: true,
      toAyah: true,
    },
  });

  const prelude = stages.find((s) => s.kind === StageKind.CHAPTER) ?? null;
  const mains = stages.filter((s) => s.kind === StageKind.MAIN_STAGE);
  const subs = stages.filter((s) => s.kind === StageKind.SUB_STAGE);

  // جزء كلّ حزب من HizbBoundary (مرجعٌ خام) — يُعرض للجميع؛ رقم الحزب وحده يُحجب.
  const boundaries = await db.hizbBoundary.findMany({ select: { hizb: true, juz: true } });
  const juzByHizb = new Map(boundaries.map((b) => [b.hizb, b.juz]));

  const mainStages: MaraqiMainStage[] = mains.map((m) => ({
    stageId: m.id,
    ordinal: m.ordinal,
    nameAr: m.nameAr,
    subStages: subs
      .filter((s) => s.parentId === m.id)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((s) => ({
        stageId: s.id,
        ordinal: s.ordinal,
        label: displayBoundary(s.nameAr), // عرضٌ بترتيب الحفظ (الناس ← الأعلى)
        fromSurah: s.fromSurah,
        fromAyah: s.fromAyah,
        toSurah: s.toSurah,
        toAyah: s.toAyah,
        juz: s.hizbNumber != null ? (juzByHizb.get(s.hizbNumber) ?? null) : null,
        hizb: canSeeHizb ? s.hizbNumber : null,
      })),
  }));

  return {
    prelude: prelude ? { stageId: prelude.id, nameAr: prelude.nameAr } : null,
    mainStages,
    canSeeHizb,
  };
}

/** المسارات الفعّالة لمراقي (للعرض الإداري وقاعدة الإسناد). */
export async function listMaraqiTracks(db: PrismaClient = prisma): Promise<TrackLite[]> {
  const program = await db.program.findUnique({
    where: { key: ProgramKey.MARAQI },
    select: { id: true },
  });
  if (!program) return [];
  return db.track.findMany({
    where: { programId: program.id, isActive: true },
    select: { id: true, nameAr: true, linesPerDay: true, ordinal: true },
    orderBy: { ordinal: "asc" },
  });
}
