import { ProgramKey, StageKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ayahOrdinal } from "./quran-ordinal";

// التنبّؤ بالمواعيد (الفكرة ٤): على وتيرة الطالب — متى يُتمّ حزبه وحصاده وتخرّجه.
// **إرشاديٌّ لا مُلزِم** (قرار محمد): تقديرٌ يُعرض، لا موعد يُحاسَب عليه. قراءةٌ فقط.

export interface Forecast {
  hasPace: boolean;
  pacePerDay: number | null;      // آياتٌ في اليوم الدراسيّ (حلقةٍ) الواحد
  hizbDoneDate: string | null;    // تقدير إتمام حزبه الحاليّ (جاهزٌ للحصاد)
  graduationDate: string | null;  // تقدير التخرّج (إتمام المراقي)
  note: string;                   // تنبيهٌ أنّه إرشاديّ
}

const OFF = new Set([5, 6]); // الجمعة=٥ والسبت=٦ (الحكم ٣) — لا تُحسب.

function toUTC(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

/** عدد أيام الحلقة (الأحد→الخميس) بين تاريخين شاملًا (الحكم ٣). */
export function circleDaysBetween(startISO: string, endISO: string): number {
  let n = 0;
  for (let t = toUTC(startISO).getTime(), end = toUTC(endISO).getTime(); t <= end; t += 86400000) {
    if (!OFF.has(new Date(t).getUTCDay())) n += 1;
  }
  return n;
}

/** يضيف n يومًا من أيام الحلقة إلى تاريخ (يتخطّى الجمعة/السبت — الحكم ٣). */
export function addCircleDays(startISO: string, n: number): string {
  const d = toUTC(startISO);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!OFF.has(d.getUTCDay())) added += 1;
  }
  return iso(d);
}

/** تنبؤٌ لطالبٍ من وتيرة حفظه (آياتٌ متمايزة ÷ أيام الحلقة المنقضية). */
export async function getStudentForecast(
  studentId: string, db: PrismaClient = prisma, today: string = new Date().toISOString().slice(0, 10),
): Promise<Forecast> {
  const note = "تقديرٌ إرشاديّ على وتيرتك — لا موعد يُحاسَب عليه.";
  const none: Forecast = { hasPace: false, pacePerDay: null, hizbDoneDate: null, graduationDate: null, note };

  const sessions = await db.dailySession.findMany({
    where: { studentId, hifzMastered: true, hifzFromSurah: { not: null } },
    orderBy: { date: "asc" },
    select: { date: true, hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true },
  });
  if (sessions.length === 0) return none;

  // الآيات المتمايزة المحفوظة + الجبهة (أدنى ترتيبٍ بلغه).
  const memorized = new Set<number>();
  let front = Infinity;
  for (const s of sessions) {
    const lo = ayahOrdinal(s.hifzFromSurah as number, (s.hifzFromAyah ?? 1));
    const hi = ayahOrdinal(s.hifzToSurah as number, (s.hifzToAyah ?? 1));
    for (let o = Math.min(lo, hi); o <= Math.max(lo, hi); o++) memorized.add(o);
    front = Math.min(front, lo, hi);
  }
  const firstDate = iso(sessions[0].date);
  const days = circleDaysBetween(firstDate, today);
  if (days < 3 || memorized.size === 0) return { ...none, note: "بعد جلساتٍ أكثر يظهر تقديرٌ لوتيرتك." };
  const pace = memorized.size / days; // آية/يوم حلقة
  if (pace <= 0) return none;

  // حدود مراحل مراقي الفرعية (الأحزاب) بالترتيب — لحساب المتبقّي.
  const subs = await db.stage.findMany({
    where: { kind: StageKind.SUB_STAGE, program: { key: ProgramKey.MARAQI }, fromSurah: { not: null } },
    select: { fromSurah: true, fromAyah: true, toSurah: true, toAyah: true },
  });
  if (subs.length === 0) return none;
  const spans = subs.map((s) => {
    const a = ayahOrdinal(s.fromSurah as number, s.fromAyah as number);
    const b = ayahOrdinal(s.toSurah as number, s.toAyah as number);
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  });
  const maraqiEnd = Math.min(...spans.map((s) => s.lo)); // أعمق نقطة (نهاية المراقي)
  const curHizb = spans.find((s) => s.lo <= front && front <= s.hi);

  const remHizb = curHizb ? Math.max(0, front - curHizb.lo) : 0;
  const remGrad = Math.max(0, front - maraqiEnd);

  return {
    hasPace: true,
    pacePerDay: Math.round(pace * 10) / 10,
    hizbDoneDate: remHizb > 0 ? addCircleDays(today, Math.ceil(remHizb / pace)) : null,
    graduationDate: remGrad > 0 ? addCircleDays(today, Math.ceil(remGrad / pace)) : null,
    note,
  };
}

/** تنبؤ المستخدم عن نفسه (من هويّته). */
export async function getMyForecast(userId: string, db: PrismaClient = prisma): Promise<Forecast> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { student: { select: { id: true } } } });
  if (!user?.student) return { hasPace: false, pacePerDay: null, hizbDoneDate: null, graduationDate: null, note: "" };
  return getStudentForecast(user.student.id, db);
}
