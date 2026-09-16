-- م٦أ-٢ (الاقتصاد — الربط التلقائيّ): ECONOMY_RULES.md الركن ١ (تفعيل AUTO).
-- الاسم «9zzzzzzz» (سبعة z) ليُطبَّق معجميًّا أخيراً (يقع بعد «9zzzzzz_guardian_gifts»).
-- جدولان بلا FK (نمط الترحيلات المتأخّرة الآمن). لا يمسّ جداول م٦أ القائمة — إضافةٌ محضة.

-- CreateEnum
CREATE TYPE "AutoEventType" AS ENUM (
  'ATTENDANCE', 'HIZB_EXAM_PASS', 'STAGE_EXAM_PASS', 'DAILY_HARVEST', 'PROMOTION'
);

-- CreateTable
CREATE TABLE "AutoGrantRule" (
    "id" TEXT NOT NULL,
    "pointItemId" TEXT NOT NULL,
    "eventType" "AutoEventType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoGrantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoGrant" (
    "id" TEXT NOT NULL,
    "eventType" "AutoEventType" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "pointTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoGrantRule_pointItemId_key" ON "AutoGrantRule"("pointItemId");

-- CreateIndex
CREATE INDEX "AutoGrantRule_eventType_active_idx" ON "AutoGrantRule"("eventType", "active");

-- CreateIndex (منع الازدواج: الحدث الواحد يُمنح مرّةً واحدةً للطالب الواحد)
CREATE UNIQUE INDEX "AutoGrant_eventType_sourceRef_studentId_key" ON "AutoGrant"("eventType", "sourceRef", "studentId");

-- CreateIndex
CREATE INDEX "AutoGrant_studentId_idx" ON "AutoGrant"("studentId");
