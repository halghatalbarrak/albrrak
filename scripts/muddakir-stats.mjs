// إحصاء مُدَّكِر — قراءة فقط، بلا بيانات شخصية.
// ١) التسكينات حسب الوضع (ACTIVE/REVIEW_ONLY)
// ٢) الطاقم النشط حسب الدور (MANAGER/ADMIN/SUPERVISOR/EXAMINER)
// ٣) عدد الإسنادات النشطة (حافظ ← مشرف)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const [modes, staff, sups] = await Promise.all([
    prisma.$queryRaw`
      SELECT mode, COUNT(*)::int AS cnt
      FROM "MuddakirProfile"
      GROUP BY mode
      ORDER BY mode
    `,
    prisma.$queryRaw`
      SELECT role, COUNT(*)::int AS cnt
      FROM "MuddakirStaff"
      WHERE "endedAt" IS NULL
      GROUP BY role
      ORDER BY role
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS cnt
      FROM "MuddakirSupervision"
      WHERE "endedAt" IS NULL
    `,
  ]);

  console.log("\nجدول تشخيص مُدَّكِر (قراءة فقط)\n");

  console.log("١) التسكينات حسب الوضع:");
  console.log("   الوضع         | العدد");
  console.log("   --------------|------");
  if (!modes.length) {
    console.log("   (لا تسكينات)");
  } else {
    for (const r of modes) console.log(`   ${String(r.mode).padEnd(14)} | ${r.cnt}`);
  }

  console.log("\n٢) الطاقم النشط حسب الدور:");
  console.log("   الدور         | العدد");
  console.log("   --------------|------");
  if (!staff.length) {
    console.log("   (لا طاقم)");
  } else {
    for (const r of staff) console.log(`   ${String(r.role).padEnd(14)} | ${r.cnt}`);
  }

  const supCnt = sups[0]?.cnt ?? 0;
  console.log(`\n٣) الإسنادات النشطة (حافظ ← مشرف): ${supCnt}`);

} catch (e) {
  console.error("❌ خطأ:", e?.message);
} finally {
  await prisma.$disconnect();
}
