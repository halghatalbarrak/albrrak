import { MuddakirDayStatus, QaidahEvalResult, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { makkahDayDate } from "@/lib/muddakir";
import { computeStreak, mergeProgramDays, type DayMark, type DayStatus, type StreakResult } from "./streak";

// ═══════════════ علامات الأيّام ومصدر السلسلة (ل٤، §٤) ═══════════════
//
// لكلّ برنامجٍ مصدرُ يومٍ قائم. المدّكر إيقاعُه يوميٌّ (MuddakirDay مفتاحه يومٌ مكّيّ)، فيُملأ
// تقويميّاً: يومٌ ماضٍ بلا سجلٍّ = تقصير (فائت). مراقي والقاعدة جلساتٌ لا يومٌ يوميّ واضح، ولا
// تقويمَ أيّام عملٍ موثوقٌ لهما هنا (مفتاح مراقي UTC — انظر ملاحظة ل٢)، فنُصدر أيّامَها المسجَّلة
// فقط بلا كسرٍ اصطناعيّ (لا تقصير للفجوات) — تفسيرٌ متحفّظٌ لا يكسر السلسلة زوراً.

const WINDOW_DAYS = 400;
const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);

/** المدّكر: مملوءٌ تقويميّاً من أوّل يومٍ مسجَّل حتى اليوم (فالفوات تقصيرٌ يقطع). */
export async function muddakirDayMarks(studentId: string, db: PrismaClient, today: string): Promise<DayMark[]> {
  const from = addDays(today, -WINDOW_DAYS);
  const rows = await db.muddakirDay.findMany({
    where: { studentId, dayDate: { gte: new Date(`${from}T00:00:00.000Z`) } },
    select: { dayDate: true, status: true },
    orderBy: { dayDate: "asc" },
  });
  if (!rows.length) return [];
  const byDate = new Map(rows.map((r) => [isoOf(r.dayDate), r.status]));
  const start = isoOf(rows[0].dayDate); // أوّل يومٍ مسجَّل = تقريبُ بدء الالتحاق
  const marks: DayMark[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const st = byDate.get(d);
    let status: DayStatus;
    if (st === undefined) status = d === today ? "OPEN" : "SHORTFALL";
    else if (st === MuddakirDayStatus.COMPLETE || st === MuddakirDayStatus.MADE_UP) status = "COMPLETE";
    else if (st === MuddakirDayStatus.EXCUSED) status = "EXCUSED";
    else if (st === MuddakirDayStatus.SHORTFALL) status = "SHORTFALL";
    else if (st === MuddakirDayStatus.PENDING_MAKEUP) status = "OPEN"; // بانتظار القضاء — لم يُكسر بعد
    else status = d === today ? "OPEN" : "SHORTFALL"; // OPEN ماضٍ = لم يُتمّ
    marks.push({ date: d, status });
  }
  return marks;
}

/** القاعدة المدنية: الأيّام المسجَّلة فقط — متقن/غير متقن = إتمامٌ (عمل اليوم)، مؤجَّل = عذر. */
export async function qaidahDayMarks(studentId: string, db: PrismaClient, today: string): Promise<DayMark[]> {
  const from = addDays(today, -WINDOW_DAYS);
  const rows = await db.qaidahDailyEval.findMany({
    where: { studentId, date: { gte: new Date(`${from}T00:00:00.000Z`) } },
    select: { date: true, result: true },
  });
  return rows.map((r) => ({ date: isoOf(r.date), status: (r.result === QaidahEvalResult.DEFERRED ? "EXCUSED" : "COMPLETE") as DayStatus }));
}

/** مراقي: الأيّام المسجَّلة التي أُتقن حفظها فقط (المهمّة المحوريّة) — بلا كسرٍ للفجوات (متحفّظ). */
export async function maraqiDayMarks(studentId: string, db: PrismaClient, today: string): Promise<DayMark[]> {
  const from = addDays(today, -WINDOW_DAYS);
  const rows = await db.dailySession.findMany({
    where: { studentId, date: { gte: new Date(`${from}T00:00:00.000Z`) }, hifzMastered: true },
    select: { date: true },
  });
  return rows.map((r) => ({ date: isoOf(r.date), status: "COMPLETE" as DayStatus }));
}

/** يدمج علامات برامج الطالب كلّها (AND عبر البرامج). البرنامج غير الملتحق به يُنتج [] فيُتخطّى. */
export async function studentDayMarks(studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<DayMark[]> {
  const today = makkahDayDate(now);
  const [mud, mar, qai] = await Promise.all([
    muddakirDayMarks(studentId, db, today),
    maraqiDayMarks(studentId, db, today),
    qaidahDayMarks(studentId, db, today),
  ]);
  return mergeProgramDays([mud, mar, qai]);
}

/** سلسلة الطالب (الحاليّة والأطول) من علامات أيّامه المدموجة. */
export async function studentStreak(studentId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<StreakResult> {
  return computeStreak(await studentDayMarks(studentId, db, now));
}
