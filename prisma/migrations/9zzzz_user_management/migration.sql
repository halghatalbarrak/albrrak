-- إدارة المستخدمين (المرحلة أ) — ROLES.md.
-- الاسم «9zzzz» ليُطبَّق معجميًّا بعد كل الترحيلات (يقع بعد «9zzzz_economy_points»… بل بعد «9zzz_economy_points»).
-- جدولٌ بلا FK (نمط الترحيلات المتأخّرة الآمن). لا يُمَسّ معنى الأدوار القائمة في الحُرّاس (دَينٌ مؤجّل).

-- AlterEnum: إضافة الدور الأعلى الجديد (لا يُستعمل في هذا الترحيل — آمنٌ داخل المعاملة على PG12+).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TECH_ADMIN';

-- CreateEnum
CREATE TYPE "ActivationPurpose" AS ENUM ('ACTIVATE', 'RESET');

-- CreateTable
CREATE TABLE "ActivationLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" "ActivationPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivationLink_token_key" ON "ActivationLink"("token");

-- CreateIndex
CREATE INDEX "ActivationLink_userId_idx" ON "ActivationLink"("userId");
