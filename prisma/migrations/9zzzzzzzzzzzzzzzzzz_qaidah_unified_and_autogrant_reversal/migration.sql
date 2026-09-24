-- دمج جلسة القاعدة في الشاشة الموحّدة + عكس المنح التلقائيّ المتنافي (م ج).
-- الاسم «9zzzzzzzzzzzzzzzzzz» (١٨ z) ليُطبَّق معجميًّا بعد «9zzzzzzzzzzzzzzzzz_event_impersonator».
-- ترحيلٌ واحدٌ (قرار محمد): قيمتا AutoEventType + عكس AutoGrant + جدول تقييم القاعدة اليوميّ.
-- إضافةٌ محضة (أعمدة nullable، جداول/أنواع جديدة) — لا تُستعمل قيم enum الجديدة في هذا الترحيل.

-- ═══ ١) عكس المنح التلقائيّ (economy — الإصلاح العامّ) ═══
-- عمودا العكس: المعكوس يبقى في الدفتر (لا حذف) ويقابله قيدٌ تعويضيّ.
ALTER TABLE "AutoGrant" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "AutoGrant" ADD COLUMN "reversedById" TEXT;

-- استبدال منع الازدواج: من قيدٍ فريدٍ مطلقٍ إلى فهرسٍ فريدٍ **جزئيّ** (غير المعكوس فقط)،
-- فيُعاد منح الحدث بعد عكسه، ويبقى المنع صارمًا للمنح النشط.
ALTER TABLE "AutoGrant" DROP CONSTRAINT IF EXISTS "AutoGrant_eventType_sourceRef_studentId_key";
DROP INDEX IF EXISTS "AutoGrant_eventType_sourceRef_studentId_key";
CREATE UNIQUE INDEX "AutoGrant_active_dedup_key"
  ON "AutoGrant"("eventType", "sourceRef", "studentId") WHERE "reversedAt" IS NULL;
CREATE INDEX "AutoGrant_eventType_sourceRef_studentId_idx"
  ON "AutoGrant"("eventType", "sourceRef", "studentId");

-- ═══ ٢) تقييم درس القاعدة اليوميّ (الحالة القابلة للعكس — ق٥/ق٦/ق٧) ═══
CREATE TYPE "QaidahEvalResult" AS ENUM ('MASTERED', 'NOT_MASTERED', 'DEFERRED');

CREATE TABLE "QaidahDailyEval" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "result" "QaidahEvalResult" NOT NULL,
    "lessonId" TEXT NOT NULL,
    "evaluatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaidahDailyEval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QaidahDailyEval_studentId_date_key" ON "QaidahDailyEval"("studentId", "date");
CREATE INDEX "QaidahDailyEval_studentId_idx" ON "QaidahDailyEval"("studentId");

-- ═══ ٣) قيمتا AutoEventType لبندَي القاعدة (لا تُستعملان في هذا الترحيل — قيد Postgres) ═══
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'QAIDAH_LESSON_MASTERED';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'QAIDAH_LESSON_NOT_MASTERED';
