-- م٦أ (الاقتصاد — بنود النقاط): ECONOMY_RULES.md الركن ١.
-- الاسم «9zzz» ليُطبَّق معجميًّا بعد كل الترحيلات (يقع بعد «9zz_certificate_revoke»).
-- جدولان بلا FK (نمط الترحيلات المتأخّرة الآمن). الرصيد مشتقٌّ من مجموع الحركات.

-- CreateEnum
CREATE TYPE "PointGrantSource" AS ENUM ('AUTO', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PointLimitPeriod" AS ENUM ('DAY', 'WEEK', 'NONE');

-- CreateTable
CREATE TABLE "PointItem" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "grantSource" "PointGrantSource" NOT NULL,
    "limitCount" INTEGER,
    "limitPeriod" "PointLimitPeriod" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "pointItemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "grantSource" "PointGrantSource" NOT NULL,
    "grantedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointTransaction_studentId_idx" ON "PointTransaction"("studentId");

-- CreateIndex
CREATE INDEX "PointTransaction_pointItemId_idx" ON "PointTransaction"("pointItemId");
