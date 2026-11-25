// قراءةٌ فقط: حصر جلسات hifzMastered=true في آخر 24 ساعة.
// لا أسماء ولا بيانات شخصيّة — أعداد + معرّفات مقتطعة (أوّل 8 أحرف).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString();

  const rows = await prisma.dailySession.findMany({
    where: {
      createdAt: { gte: since },
      hifzMastered: true,
    },
    select: {
      id: true,
      circleId: true,
      studentId: true,
      hifzFromSurah: true,
      hifzToSurah: true,
      hifzFromAyah: true,
      hifzToAyah: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // إحصاء حسب الحلقة
  const byCircle = new Map();
  for (const r of rows) {
    const key = r.circleId.slice(0, 8);
    byCircle.set(key, (byCircle.get(key) ?? 0) + 1);
  }

  const totalStudents = new Set(rows.map((r) => r.studentId)).size;

  console.log(`\n📊 جلسات الإتقان (hifzMastered=true) — آخر 24 ساعة (منذ ${sinceStr})\n`);
  console.log(`الإجماليّ                       : ${rows.length}`);
  console.log(`طلّاب مختلفون                   : ${totalStudents}`);
  console.log(`حلقات مختلفة                    : ${byCircle.size}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`تفصيل حسب الحلقة (معرّف مقتطع — عدد):`);
  for (const [cId, cnt] of [...byCircle.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cId}…  →  ${cnt}`);
  }
  console.log(`─────────────────────────────────────────`);

  if (rows.length === 0) {
    console.log(`\n⚠️  لا جلسات إتقان في آخر 24 ساعة.`);
  } else {
    console.log(`\n✅  ${rows.length} جلسة مُتقَنة في آخر 24 ساعة عبر ${byCircle.size} حلقة.`);
  }

  // جدول الجلسات (معرّف الجلسة + معرّف الطالب + السورة — بلا أسماء)
  console.log(`\nجدول الجلسات (معرّف مقتطع — طالب — من_سورة → إلى_سورة):`);
  for (const r of rows) {
    const sid = r.id.slice(0, 8);
    const stid = r.studentId.slice(0, 8);
    const range = r.hifzFromSurah != null
      ? `${r.hifzFromSurah}:${r.hifzFromAyah ?? "?"} → ${r.hifzToSurah ?? r.hifzFromSurah}:${r.hifzToAyah ?? "?"}`
      : "—";
    console.log(`  ${sid}…  طالب:${stid}…  ${range}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
