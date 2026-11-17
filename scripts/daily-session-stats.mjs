// إحصاء صفوف DailySession منذ تاريخ مُمرَّر — قراءة فقط، بلا بيانات شخصية.
// يطبع جدولاً يومياً: الإجمالي | بها نطاق حفظ | hifzMastered=true | false | null
import { PrismaClient } from "@prisma/client";

const FROM = process.env.STATS_FROM ?? "2026-11-09";

const prisma = new PrismaClient();
try {
  const rows = await prisma.$queryRaw`
    SELECT
      "date"::date                                                        AS day,
      COUNT(*)::int                                                       AS total,
      COUNT("hifzFromSurah")::int                                        AS has_range,
      COUNT(CASE WHEN "hifzMastered" = true  THEN 1 END)::int           AS mastered_true,
      COUNT(CASE WHEN "hifzMastered" = false THEN 1 END)::int           AS mastered_false,
      COUNT(CASE WHEN "hifzMastered" IS NULL THEN 1 END)::int           AS mastered_null
    FROM "DailySession"
    WHERE "date" >= ${new Date(FROM)}
    GROUP BY day
    ORDER BY day
  `;

  if (!rows.length) {
    console.log(`لا صفوف منذ ${FROM}.`);
  } else {
    console.log(`\nإحصاء DailySession منذ ${FROM}:\n`);
    console.log("اليوم       | الإجمالي | بها نطاق | أُتقن (true) | لم يُتقن (false) | null");
    console.log("------------|----------|----------|-------------|-----------------|------");
    for (const r of rows) {
      const day   = String(r.day).slice(0, 10);
      console.log(
        `${day} | ${String(r.total).padStart(8)} | ${String(r.has_range).padStart(8)} | ${String(r.mastered_true).padStart(11)} | ${String(r.mastered_false).padStart(15)} | ${r.mastered_null}`
      );
    }
    const totals = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        has_range: acc.has_range + r.has_range,
        mastered_true: acc.mastered_true + r.mastered_true,
        mastered_false: acc.mastered_false + r.mastered_false,
        mastered_null: acc.mastered_null + r.mastered_null,
      }),
      { total: 0, has_range: 0, mastered_true: 0, mastered_false: 0, mastered_null: 0 }
    );
    console.log("------------|----------|----------|-------------|-----------------|------");
    console.log(
      `المجموع     | ${String(totals.total).padStart(8)} | ${String(totals.has_range).padStart(8)} | ${String(totals.mastered_true).padStart(11)} | ${String(totals.mastered_false).padStart(15)} | ${totals.mastered_null}`
    );
  }
} catch (e) {
  console.error("❌ QUERY FAILED:", e?.message);
} finally {
  await prisma.$disconnect();
}
