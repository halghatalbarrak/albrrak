import { PrismaClient } from "@prisma/client";

// عميل Prisma للاختبارات — يقرأ DATABASE_URL (قاعدة اختبار محلية/خدمة CI).
// صمّام أمان: يرفض العمل على قاعدة لا يبدو اسمها اختباريًّا.
const url = process.env.DATABASE_URL ?? "";
if (!/test|localhost|127\.0\.0\.1/.test(url)) {
  throw new Error(
    "الاختبارات ترفض التشغيل: DATABASE_URL لا يشير إلى قاعدة اختبار محلية.",
  );
}

export const prisma = new PrismaClient();

/** تصفير كل الجداول بين الاختبارات — عزلٌ تام. */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
