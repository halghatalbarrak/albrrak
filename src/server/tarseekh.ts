import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { maraqiKey, type UnitRow } from "./track-units";
import { memorizedFrontier, trackPolicyAndUnits } from "./maraqi-consolidation";
import { getStudentErrorTally, orderSegmentsByWeakness } from "./weakness-map";

// ═══════════════ الترسيخ والمراجعة بالوحدات لكلّ مسار (مراقي ٢) ═══════════════
//
// حسم محمد (مراقي ٢): المقطع = **وحدة المسار**، والمقادير **لكلّ مسار من الإدارة** لا ثوابت:
//   • الترسيخ = `tarseekhUnits` وحدةً سابقةً لوحدة اليوم (بديلٌ عن «آخر ١٠ جلسات»).
//   • المراجعة = كلّ المحفوظ الراسخ (ما قبل نافذة الترسيخ) مقسومًا على `reviewDaysPerWeek`،
//     فيُختَم المحفوظ أسبوعيًّا بلا سقف. المراجعة فارغةٌ بأمان أوّل المسار (محفوظٌ صغير).
// الرصد عبر التسميع المرن القائم (recordTarseekh/recordMurajaah)، وخطأ المراجعة (الحكم ٥)
// يبقى على نافذة الجلسات في daily-session (REVIEW_ERROR_WINDOW) — لا يُمسّ.

export interface Segment {
  id: string; // معرّفٌ عرضيّ (الوحدة) — لا يُستعمل في رصد خطأ المراجعة (ذاك بمعرّف الجلسة)
  date: string; // غير مستعمَلٍ في النموذج الوحدويّ (يبقى للتوافق)
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

const unitSegment = (u: UnitRow): Segment => ({
  id: `u${u.unitNo}`, date: "",
  fromSurah: u.startSurah, fromAyah: u.startAyah, toSurah: u.endSurah, toAyah: u.endAyah,
});

/** نطاقات المحفوظ خارج الترتيب المسكَّن (JSON) — لإدخالها في الراسخ (مطابقٌ لـtoday-target). */
function parseOutOfOrder(raw: unknown): { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    if ([o.fromSurah, o.fromAyah, o.toSurah, o.toAyah].every((n) => typeof n === "number")) {
      out.push({ fromSurah: o.fromSurah as number, fromAyah: o.fromAyah as number, toSurah: o.toSurah as number, toAyah: o.toAyah as number });
    }
  }
  return out;
}

export interface ConsolidationView {
  /** وحدات نافذة الترسيخ (`tarseekhUnits`) — تُراجَع يوميًّا. */
  tarseekh: { windowSize: number; segments: Segment[] };
  /** الراسخ (ما قبل النافذة) — يُوزَّع على `reviewDaysPerWeek` (حصّةٌ/يوم). */
  review: { stockCount: number; khums: number; segments: Segment[] };
}

/**
 * الترسيخ والمراجعة للطالب بوحدات مساره (مراقي ٢): الوحدات التي بلغها موضعُه، آخر `tarseekhUnits`
 * منها في الترسيخ، وما قبلها راسخٌ يُوزَّع على `reviewDaysPerWeek` (⌈الراسخ ÷ الأيّام⌉). فارغٌ
 * بأمان قبل أوّل حفظٍ أو بلا مسار.
 */
export async function getConsolidation(
  studentId: string,
  db: PrismaClient = prisma,
): Promise<ConsolidationView> {
  const policy = await trackPolicyAndUnits(studentId, db);
  if (!policy.trackId || policy.units.length === 0) {
    return { tarseekh: { windowSize: policy.tarseekhUnits, segments: [] }, review: { stockCount: 0, khums: 0, segments: [] } };
  }
  const frontier = await memorizedFrontier(studentId, db);
  const reached = frontier === null ? 0 : policy.units.filter((u) => maraqiKey(u.startSurah, u.startAyah) <= frontier).length;

  const placement = await db.maraqiPlacement.findUnique({ where: { studentId }, select: { outOfOrder: true } });
  const oooRanges = parseOutOfOrder(placement?.outOfOrder);
  const isOoo = (u: UnitRow) => oooRanges.some((r) =>
    maraqiKey(u.startSurah, u.startAyah) >= maraqiKey(r.fromSurah, r.fromAyah) &&
    maraqiKey(u.endSurah, u.endAyah) <= maraqiKey(r.toSurah, r.toAyah));

  const inOrder = policy.units.slice(0, reached);
  const cut = Math.max(0, reached - policy.tarseekhUnits);
  const inTarseekh = inOrder.slice(cut);
  const oooUnits = policy.units.slice(reached).filter(isOoo);
  const rasikh = [...inOrder.slice(0, cut), ...oooUnits].sort((a, b) => a.unitNo - b.unitNo);

  // الفكرة ٣: ترتيبٌ فقط للمراجعة — الأضعف أوّلاً (المقدار والمجموعة لا يتغيّران).
  const tally = await getStudentErrorTally(studentId, db);
  const orderedRasikh = orderSegmentsByWeakness(rasikh.map(unitSegment), tally);

  return {
    tarseekh: { windowSize: policy.tarseekhUnits, segments: inTarseekh.map(unitSegment) },
    review: {
      stockCount: rasikh.length,
      khums: Math.ceil(rasikh.length / Math.max(1, policy.reviewDaysPerWeek)),
      segments: orderedRasikh,
    },
  };
}

// ═══════════════ تتبّع الدورة الأسبوعية بالمقدار ═══════════════

/** يوم بلا وقت (UTC) — يطابق @db.Date. */
function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** بداية أسبوع الحلقة = الأحد السابق (الأحد → الخميس، والجمعة/السبت عطلة). */
function weekStartSunday(date: string | Date): Date {
  const d = toDateOnly(date);
  return new Date(d.getTime() - d.getUTCDay() * 86400000); // getUTCDay: 0 = الأحد
}

export interface WeeklyReview {
  required: number; // المطلوب = كامل المحفوظ الراسخ (وحدات)
  done: number; // المُنجَز = مجموع المُسمَّع هذا الأسبوع
  remaining: number; // المتبقّي = المطلوب − المُنجَز (لا يقلّ عن صفر)
  percent: number; // نسبة الإنجاز 0..100
  complete: boolean; // اكتملت الدورة؟
  weekStart: string; // الأحد (YYYY-MM-DD)
}

/**
 * دورة المراجعة الأسبوعية بالمقدار: المطلوب = كامل الراسخ (وحدات)؛ المُنجَز = مجموع murajaahCount
 * خلال أيّام الحلقة (من الأحد بمقدار `reviewDaysPerWeek` يومًا). لا راسخ ⟵ مكتملةٌ حكمًا.
 */
export async function getWeeklyReview(
  studentId: string,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<WeeklyReview> {
  const [{ review }, policy] = await Promise.all([getConsolidation(studentId, db), trackPolicyAndUnits(studentId, db)]);
  const required = review.stockCount;
  const start = weekStartSunday(date);
  const end = new Date(start.getTime() + Math.max(0, policy.reviewDaysPerWeek - 1) * 86400000);

  const agg = await db.dailySession.aggregate({
    where: { studentId, date: { gte: start, lte: end } },
    _sum: { murajaahCount: true },
  });
  const done = agg._sum.murajaahCount ?? 0;
  const remaining = Math.max(0, required - done);
  const percent = required === 0 ? 100 : Math.min(100, Math.round((done / required) * 100));
  return {
    required,
    done,
    remaining,
    percent,
    complete: done >= required,
    weekStart: start.toISOString().slice(0, 10),
  };
}
