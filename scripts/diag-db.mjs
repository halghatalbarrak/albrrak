// تشخيص: يعيد إنتاج مسار وقت التشغيل (استعلام Prisma عبر DATABASE_URL / منفذ 6543).
// يطبع شكل الاتصال (بلا كلمة سر) والنتيجة أو الخطأ الحقيقي (اسمه، رمزه، رسالته).
// رسائل أخطاء Prisma تُخفي بيانات الاعتماد، فلا يتسرّب سرّ.
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
try {
  const u = new URL(url);
  console.log("DATABASE_URL host:port =", `${u.hostname}:${u.port || "(افتراضي)"}`);
  console.log("DATABASE_URL params   =", u.search || "(لا شيء)");
} catch {
  console.log("DATABASE_URL غير قابل للتحليل أو غير مضبوط.");
}

const prisma = new PrismaClient();
try {
  const nationalities = await prisma.nationality.count();
  const schoolStages = await prisma.schoolStage.count();
  console.log(`✅ QUERY OK — Nationality=${nationalities}, SchoolStage=${schoolStages}`);
} catch (e) {
  console.error("❌ QUERY FAILED (هذا هو خطأ وقت التشغيل الحقيقي):");
  console.error("  name:   ", e?.name);
  console.error("  code:   ", e?.code);
  console.error("  message:", e?.message);
} finally {
  await prisma.$disconnect();
}
