import { PrismaClient } from "@prisma/client";

// عميل Prisma وحيد (singleton) — يتجنّب استنزاف الاتصالات في dev مع HMR.
// التطبيق يصل إلى القاعدة عبر هذا العميل بدور مميّز يتجاوز RLS؛
// الوصول العام (anon) مغلق بالكامل — انظر أول ترحيل.

// الإنتاج (serverless): DATABASE_URL = Transaction Pooler (port 6543).
// pgbouncer=true يوقف Prepared Statements غير المدعومة في وضع المعاملات.
// connection_limit=1 يمنع استنزاف الاتصالات حين تُولَد وظائف متوازية.
function prodUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("pgbouncer=true")) return undefined; // لا تعديل — URL صحيح مسبقاً
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "pgbouncer=true&connection_limit=1";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaOptions =
  process.env.NODE_ENV === "production"
    ? ({ datasources: { db: { url: prodUrl() } } } as ConstructorParameters<typeof PrismaClient>[0])
    : {};

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
