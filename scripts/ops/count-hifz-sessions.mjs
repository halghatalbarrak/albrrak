// قراءةٌ فقط: حصر سجلّات التسميع والإتقان المكتوبة في آخر أسبوعين.
// لا تغيير في البيانات — للتشخيص فقط.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const since = twoWeeksAgo.toISOString().slice(0, 10);

  const [
    totalSessions,
    masteredSessions,
    notMasteredSessions,
    nullMasteredSessions,
    attRows,
    tarseekhRows,
    murajaahRows,
  ] = await Promise.all([
    // كل سجلّات التسميع (hifzFromSurah موجودة ← تسميع حفظ)
    prisma.dailySession.count({
      where: {
        date: { gte: twoWeeksAgo },
        hifzFromSurah: { not: null },
      },
    }),
    // إتقان صريح = true
    prisma.dailySession.count({
      where: {
        date: { gte: twoWeeksAgo },
        hifzMastered: true,
      },
    }),
    // غير مُتقَنة = false
    prisma.dailySession.count({
      where: {
        date: { gte: twoWeeksAgo },
        hifzMastered: false,
      },
    }),
    // hifzMastered فارغة (null) مع تسميع
    prisma.dailySession.count({
      where: {
        date: { gte: twoWeeksAgo },
        hifzFromSurah: { not: null },
        hifzMastered: null,
      },
    }),
    // سجلّات الحضور
    prisma.attendance.count({
      where: { date: { gte: twoWeeksAgo } },
    }),
    // ترسيخ
    prisma.dailySession.count({
      where: { date: { gte: twoWeeksAgo }, tarseekhDone: true },
    }),
    // مراجعة
    prisma.dailySession.count({
      where: { date: { gte: twoWeeksAgo }, murajaahDone: true },
    }),
  ]);

  console.log(`\n📊 سجلّات الشاشة الموحّدة — منذ ${since} (آخر ١٤ يوماً)\n`);
  console.log(`الحضور                        : ${attRows}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`سجلّات تسميع حفظ (إجماليّ)   : ${totalSessions}`);
  console.log(`  ↳ hifzMastered = true        : ${masteredSessions}`);
  console.log(`  ↳ hifzMastered = false       : ${notMasteredSessions}`);
  console.log(`  ↳ hifzMastered = null        : ${nullMasteredSessions}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`سجلّات ترسيخ                  : ${tarseekhRows}`);
  console.log(`سجلّات مراجعة                 : ${murajaahRows}`);

  if (totalSessions === 0) {
    console.log(`\n⚠️  لا سجلّات تسميع إطلاقاً — الخلل في الحفظ لا في التقرير.`);
  } else if (masteredSessions === 0 && nullMasteredSessions > 0) {
    console.log(`\n⚠️  ${nullMasteredSessions} تسميع بـhifzMastered=null — المعلّمون يسجّلون لكن الحقل لا يُحدَّث.`);
  } else if (masteredSessions === 0) {
    console.log(`\n⚠️  جميع التسميعات غير مُتقَنة — طبيعيّ إن كانت محاولات متعدّدة.`);
  } else {
    console.log(`\n✅  البيانات موجودة — ${masteredSessions} جلسة مُتقَنة في آخر أسبوعين.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
