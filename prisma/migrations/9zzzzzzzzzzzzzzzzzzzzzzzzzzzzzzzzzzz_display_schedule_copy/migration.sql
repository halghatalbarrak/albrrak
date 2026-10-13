-- الشاشة التحفيزيّة (DISPLAY_SCREEN_RULES §٩ و§١٠): نسخ الرابط + الجدولة بأوقات الصلاة.
-- الاسم «9z…z» (خمسة وثلاثون z) ليُطبَّق معجميّاً بعد آخر ترحيلٍ قائم. إضافةٌ محضة: بلا FK، بلا حذف.
-- أنواعٌ جديدة (CREATE TYPE) تُنشأ وتُستعمَل في الترحيل نفسه بأمان (قيد ADD VALUE لا يمسّها).

-- AlterTable: نسخةٌ مشفَّرة للرمز (§٩) — تبقى null للرموز القديمة.
ALTER TABLE "DisplayScreenToken" ADD COLUMN "tokenEnc" TEXT;

-- AlterTable: تعديلٌ يدويّ بالدقائق لكل صلاة فوق حساب أمّ القرى (§١٠) — افتراضيّه ٠.
ALTER TABLE "DisplayScreen" ADD COLUMN "adjFajr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DisplayScreen" ADD COLUMN "adjDhuhr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DisplayScreen" ADD COLUMN "adjAsr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DisplayScreen" ADD COLUMN "adjMaghrib" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DisplayScreen" ADD COLUMN "adjIsha" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "DisplayScheduleStart" AS ENUM ('PRAYER', 'FIXED');

-- CreateEnum
CREATE TYPE "DisplayPrayer" AS ENUM ('FAJR', 'DHUHR', 'ASR', 'MAGHRIB', 'ISHA');

-- CreateEnum
CREATE TYPE "DisplayPrayerRel" AS ENUM ('AFTER', 'BEFORE');

-- CreateEnum
CREATE TYPE "DisplayScheduleContent" AS ENUM ('PROGRAM', 'SLIDES');

-- CreateTable
CREATE TABLE "DisplaySchedule" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "startMode" "DisplayScheduleStart" NOT NULL,
    "prayer" "DisplayPrayer",
    "rel" "DisplayPrayerRel",
    "offsetMin" INTEGER NOT NULL DEFAULT 0,
    "fixedTime" TEXT,
    "durationMin" INTEGER NOT NULL,
    "contentMode" "DisplayScheduleContent" NOT NULL,
    "programId" TEXT,
    "slideIds" TEXT,
    "daysMask" INTEGER NOT NULL DEFAULT 127,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisplaySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisplaySchedule_screenId_active_idx" ON "DisplaySchedule"("screenId", "active");
