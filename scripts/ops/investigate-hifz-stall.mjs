/**
 * التحقيق: لماذا لا يتقدّم مقرّر الحفظ لدى طلاب حلقة معيّنة؟
 * الفرضيات (أ–و):
 *   أ) AWAITING_READING_TEST (محجوب)
 *   ب) NO_TRACK
 *   ج) mustRepeat=true دائماً (الحكم ١ نشط)
 *   د) mastered=false في كل السجلات الأخيرة
 *   ه) لا تسكين (MaraqiPlacement)
 *   و) لا جلسات مسجّلة أصلاً (٧ أيام)
 *
 * ⚠️ لا أسماء في المخرجات — معرّفات مقتطعة وأسماء حلقات فقط.
 *
 * الاستخدام: CIRCLE_NAME="أبي بكر" node scripts/ops/investigate-hifz-stall.mjs
 */
import { PrismaClient, StudentState } from "@prisma/client";

const prisma = new PrismaClient();
const CIRCLE_NAME = process.env.CIRCLE_NAME ?? "";
const DAYS = 7;
const maskId = (id) => `${id.slice(0, 8)}…`;

function makkahDayStart(d) {
  // مكة UTC+3
  const makkah = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  makkah.setUTCHours(0, 0, 0, 0);
  return new Date(makkah.getTime() - 3 * 60 * 60 * 1000);
}

async function main() {
  if (!CIRCLE_NAME) {
    console.error("يجب تمرير CIRCLE_NAME كمتغيّر بيئة.");
    process.exit(1);
  }

  const circle = await prisma.circle.findFirst({
    where: { nameAr: { contains: CIRCLE_NAME } },
    select: { id: true, nameAr: true },
  });
  if (!circle) {
    const all = await prisma.circle.findMany({ select: { nameAr: true }, orderBy: { nameAr: "asc" } });
    console.error(`لم يُعثَر على حلقة تحتوي: "${CIRCLE_NAME}"`);
    console.error("الحلقات المتاحة:");
    for (const c of all) console.error(`  • ${c.nameAr}`);
    process.exit(1);
  }
  console.log(`\nالحلقة: ${circle.nameAr} (${circle.id.slice(0, 8)}…)\n`);

  // جلب أوّل ٥ طلاب نشطين في الحلقة
  const enrollments = await prisma.enrollment.findMany({
    where: { circleId: circle.id, endedAt: null, student: { deletedAt: null } },
    select: {
      student: {
        select: {
          id: true,
          state: true,
          trackAssignments: { where: { endedAt: null }, select: { trackId: true }, take: 1 },
        },
      },
    },
    take: 5,
  });

  if (enrollments.length === 0) {
    console.log("لا طلاب نشطين في هذه الحلقة.\n");
    return;
  }

  const today = makkahDayStart(new Date());
  const since = new Date(today.getTime() - DAYS * 24 * 60 * 60 * 1000);

  // جلب السجلات وبيانات التسكين دفعةً
  const studentIds = enrollments.map((e) => e.student.id);

  const [sessions, placements, lastUnmastered] = await Promise.all([
    prisma.dailySession.findMany({
      where: { studentId: { in: studentIds }, date: { gte: since } },
      select: { studentId: true, date: true, hifzFromSurah: true, hifzToSurah: true, hifzMastered: true, hifzAttempts: true },
      orderBy: { date: "desc" },
    }),
    prisma.maraqiPlacement.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, reachedSurah: true, reachedAyah: true },
    }),
    prisma.dailySession.findMany({
      where: {
        studentId: { in: studentIds },
        hifzMastered: false,
        date: { lt: today },
      },
      select: { studentId: true, date: true, hifzFromSurah: true, hifzToSurah: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const sessMap = new Map();
  for (const s of sessions) {
    if (!sessMap.has(s.studentId)) sessMap.set(s.studentId, []);
    sessMap.get(s.studentId).push(s);
  }
  const placementMap = new Map(placements.map((p) => [p.studentId, p]));
  const lastUnmasteredMap = new Map();
  for (const s of lastUnmastered) {
    if (!lastUnmasteredMap.has(s.studentId)) lastUnmasteredMap.set(s.studentId, s);
  }

  console.log("─".repeat(72));
  console.log("نتائج الفرضيات (أ–و) لكلّ طالب:\n");

  for (const { student: s } of enrollments) {
    const sid = s.id;
    const sess = sessMap.get(sid) ?? [];
    const placement = placementMap.get(sid);
    const unmastered = lastUnmasteredMap.get(sid);

    const hypA = s.state === StudentState.AWAITING_READING_TEST;
    const hypB = s.trackAssignments.length === 0;
    const hypE = !placement;
    const hypF = sess.length === 0;
    const hypD = sess.length > 0 && sess.every((x) => x.hifzMastered === false);
    const hypC = !!unmastered; // آخر جلسة قبل اليوم لم تُتقَن

    console.log(`الطالب: ${maskId(sid)} | الحالة: ${s.state}`);
    console.log(`  أ) AWAITING_READING_TEST : ${hypA ? "✅ نعم" : "❌ لا"}`);
    console.log(`  ب) لا مسار (NO_TRACK)   : ${hypB ? "✅ نعم" : "❌ لا"}`);
    console.log(`  ج) mustRepeat نشط       : ${hypC ? `✅ نعم (آخر جلسة غير متقنة ${unmastered?.date?.toISOString().slice(0, 10)})` : "❌ لا"}`);
    console.log(`  د) mastered=false دائماً: ${hypD ? "✅ نعم" : (sess.length === 0 ? "(لا سجلات)" : "❌ لا")}`);
    console.log(`  ه) لا تسكين             : ${hypE ? "✅ نعم" : "❌ لا"}`);
    console.log(`  و) لا جلسات ٧ أيام      : ${hypF ? "✅ نعم" : `❌ لا (${sess.length} جلسة)`}`);
    console.log(`  — سجلات الأيام السبعة:`);
    for (const x of sess) {
      console.log(`     ${x.date.toISOString().slice(0, 10)} | س${x.hifzFromSurah ?? "?"} ← س${x.hifzToSurah ?? "?"} | متقن:${x.hifzMastered} | محاولات:${x.hifzAttempts ?? "?"}`);
    }
    if (sess.length === 0) console.log("     (لا سجلات)");
    console.log();
  }
  console.log("─".repeat(72));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
