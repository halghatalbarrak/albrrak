import { PrismaClient } from "@prisma/client";

// عميل Prisma وحيد (singleton) — يتجنّب استنزاف الاتصالات في dev مع HMR.
// التطبيق يصل إلى القاعدة عبر هذا العميل بدور مميّز يتجاوز RLS؛
// الوصول العام (anon) مغلق بالكامل — انظر أول ترحيل.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
