import { MuddakirFaceState, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  deriveStages,
  juzBoundsFromHizb,
  makkahDayDate,
  stageForPage,
  type HizbRow,
  type MushafFaceData,
} from "@/lib/muddakir";

import { getProgramSetting } from "./settings";
import { muddakirProgramId } from "./muddakir-profile";
import { applyDueTrackChange, getDayStatus, latestTrackRequest, loadDayEngineSettings, todayPlan, type TodayPlan } from "./muddakir-day";
import { AuthorizationError } from "./errors";

// عرض يوم الحافظ الكامل (المرحلة ٥): رأسٌ (المرحلة/الأجزاء/موضع الوجه/المسار/التقدّم) + تذكير اللقاء
// + خطّة اليوم + الحالة + قضاء الأمس + الإعدادات اللازمة للعدّادات. يُقرأ مرّةً ويُخزَّن للعمل بلا إنترنت.

const MS_DAY = 86_400_000;
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);

export interface HafizTodayView {
  dayDate: string;
  track: number;
  reviewOnly: boolean;
  stage: { number: number; startJuz: number; endJuz: number; faceInStage: number; stageTotal: number; currentPage: number } | null;
  meeting: { day: string; facesToRead: number };
  status: string;
  plan: TodayPlan;
  settings: { newReps: number; firstCleanReps: number; yesterdayReps: number; treatmentLineReps: number };
  trackChange: { tracks: number[]; pendingTrack: number | null; effectiveFrom: string | null; requestedTrack: number | null };
}

/** يبني عرض يوم الحافظ. `now` محقونٌ (توقيت مكّة)، و`today` يُشتقّ منه. */
export async function getHafizTodayView(studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<HafizTodayView> {
  const today = makkahDayDate(now);
  await applyDueTrackChange(db, studentId, today); // المسار المُقرَّ يُطبَّق من يومه
  const profile = await db.muddakirProfile.findUnique({ where: { studentId } });
  if (!profile) throw new Error("لا ملفّ مُدَّكِرٍ للحافظ.");

  const programId = await muddakirProgramId(db);
  const engine = await loadDayEngineSettings(db, programId);
  const stageJuzSetting = await getProgramSetting(programId, "stageJuzCount", db);
  const juzCount = typeof stageJuzSetting === "number" && stageJuzSetting > 0 ? stageJuzSetting : 5;
  const meetingSetting = await getProgramSetting(programId, "meetingDay", db);
  const meetingDay = typeof meetingSetting === "string" ? meetingSetting : "WEDNESDAY";

  const plan = await todayPlan(studentId, today, db, now);
  const status = await getDayStatus(db, studentId, today, now);

  // الرأس: المرحلة بالصفحات (§١) وموضع الوجه الحاليّ.
  let stage: HafizTodayView["stage"] = null;
  const faces = await db.muddakirFace.findMany({ where: { studentId }, select: { page: true, state: true, firstMemorizedOn: true } });
  const lastMemorized = faces.filter((f) => f.state !== MuddakirFaceState.NEW).reduce((m, f) => Math.max(m, f.page), 0);
  const currentPage = Math.min(604, lastMemorized + 1);
  try {
    const hizb = (await db.hizbBoundary.findMany()) as unknown as HizbRow[];
    const mushaf = (await db.mushafFace.findMany({ select: { page: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true } })) as MushafFaceData[];
    if (hizb.length && mushaf.length) {
      const stages = deriveStages(mushaf, juzCount, juzBoundsFromHizb(hizb));
      const n = stageForPage(stages, currentPage) ?? 1;
      const s = stages[n - 1];
      stage = { number: n, startJuz: s.startJuz, endJuz: s.endJuz, faceInStage: currentPage - s.startPage + 1, stageTotal: s.endPage - s.startPage + 1, currentPage };
    }
  } catch { /* بيانات المصحف/الأحزاب غير مبذورة — رأسٌ مبسّط */ }

  // أوجهٌ سيقرؤها في اللقاء = محفوظُ آخر سبعة أيّام (§٦).
  const weekAgo = isoOf(new Date(new Date(`${today}T00:00:00Z`).getTime() - 6 * MS_DAY));
  const facesToRead = faces.filter((f) => f.firstMemorizedOn && isoOf(f.firstMemorizedOn) >= weekAgo).length;

  const treat = await getProgramSetting(programId, "treatmentLineReps", db);
  const settings = {
    newReps: engineNum(engine.newReps, 30), firstCleanReps: engine.firstCleanReps, yesterdayReps: engine.yesterdayReps,
    treatmentLineReps: typeof treat === "number" && treat > 0 ? treat : 10,
  };

  // تغيير المسار (§٤٫١): المسارات المتاحة، والمعلّق المُقرَّ، وآخر طلبٍ لم يُقرَّ بعد.
  const tracksSetting = await getProgramSetting(programId, "tracks", db);
  const tracks = Array.isArray(tracksSetting) ? tracksSetting.filter((x): x is number => typeof x === "number") : [1, 2, 3];
  const req = await latestTrackRequest(db, studentId);
  const requestedTrack = req && req.track !== profile.track && req.track !== (profile.pendingTrack ?? undefined) ? req.track : null;
  const trackChange = { tracks, pendingTrack: profile.pendingTrack, effectiveFrom: profile.effectiveFrom ? isoOf(profile.effectiveFrom) : null, requestedTrack };

  return {
    dayDate: today, track: profile.track, reviewOnly: profile.mode === "REVIEW_ONLY",
    stage, meeting: { day: meetingDay, facesToRead }, status, plan, settings, trackChange,
  };
}

const engineNum = (v: number, d: number) => (typeof v === "number" && v > 0 ? v : d);

/** عرض يوم الحافظ لمستخدمٍ مصادَق (يتحقّق أنّه حافظٌ ملتحق) — يُستدعى من مسار API. */
export async function hafizViewForUser(actorUserId: string, db: PrismaClient = prisma): Promise<HafizTodayView> {
  const student = await db.student.findUnique({ where: { userId: actorUserId }, select: { id: true } });
  if (!student) throw new AuthorizationError("هذه الشاشة للحافظ.");
  const profile = await db.muddakirProfile.findUnique({ where: { studentId: student.id }, select: { studentId: true } });
  if (!profile) throw new AuthorizationError("لستَ ملتحقًا بالمُدَّكِر.");
  return getHafizTodayView(student.id, db);
}
