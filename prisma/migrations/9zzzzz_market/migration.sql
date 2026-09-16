-- م٦ب (الاقتصاد — السوق الحقيقيّ بالكود): ECONOMY_RULES.md الركن ٢.
-- الاسم «9zzzzz» ليُطبَّق معجميًّا بعد كل الترحيلات (يقع بعد «9zzzz_user_management»).
-- ثلاثة جداول بلا FK (نمط الترحيلات المتأخّرة الآمن). الخصم يُكتب في دفتر م٦أ نفسه
-- (PointTransaction) — لا رصيد منفصل، فلا يُمسّ جدول م٦أ ولا منطقه.

-- AlterEnum: صلاحيّة البائع المستقلّة (لا تُستعمل في هذا الترحيل — آمنٌ داخل المعاملة على PG12+).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SELLER';

-- CreateTable
CREATE TABLE "MarketItem" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "imageUrl" TEXT,
    "pricePoints" INTEGER NOT NULL,
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCode" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "marketItemId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "pointTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentCode_code_key" ON "StudentCode"("code");

-- CreateIndex
CREATE INDEX "StudentCode_studentId_idx" ON "StudentCode"("studentId");

-- CreateIndex
CREATE INDEX "Purchase_studentId_idx" ON "Purchase"("studentId");

-- CreateIndex
CREATE INDEX "Purchase_sellerUserId_idx" ON "Purchase"("sellerUserId");
