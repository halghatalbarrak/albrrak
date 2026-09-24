-- المهمّة ٦: التسكين والانتقال بين البرامج (PLACEMENT_RULES.md ق١–ق٧).
-- الاسم «9zzzzzzzzzzzzzzzzzzz» (١٩ z) ليُطبَّق معجميًّا بعد «…zz_qaidah_unified_and_autogrant_reversal».
-- إضافةٌ محضة ومتوافقة مع الكود المنشور: أعمدة nullable مبذورة + جداول/أنواع جديدة.
-- لا تُستعمل قيم enum جديدة على أعمدةٍ قائمة، ولا يُمَسّ الفهرس الفريد الجزئيّ لـAutoGrant.

-- ═══ ق١: البرنامج صفةٌ في القيد (Enrollment) — عمودٌ + بذرٌ من الحلقة ═══
ALTER TABLE "Enrollment" ADD COLUMN "programId" TEXT;
UPDATE "Enrollment" e SET "programId" = c."programId" FROM "Circle" c WHERE c."id" = e."circleId";
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Enrollment_programId_idx" ON "Enrollment"("programId");

-- ═══ ق٤/ق٥: مسار الانتقال والمسار الافتراضيّ للمنتقلين (من الإدارة) ═══
ALTER TABLE "Program" ADD COLUMN "nextProgramId" TEXT;
ALTER TABLE "Program" ADD COLUMN "defaultTrackForIncomingId" TEXT;
ALTER TABLE "Program" ADD CONSTRAINT "Program_nextProgramId_fkey"
  FOREIGN KEY ("nextProgramId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Program" ADD CONSTRAINT "Program_defaultTrackForIncomingId_fkey"
  FOREIGN KEY ("defaultTrackForIncomingId") REFERENCES "Track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ ق٢: تمييز إتقان التسكين (بلا نقاط) عن الإتقان الفعليّ ═══
CREATE TYPE "PlacementSource" AS ENUM ('PLACEMENT');
ALTER TABLE "StageProgress" ADD COLUMN "source" "PlacementSource";

-- ═══ ق٣: تخزين محفوظ مراقي المسكَّن (جدولٌ متأخّرٌ بلا FK — نمط آمن) ═══
CREATE TABLE "MaraqiPlacement" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reachedSurah" INTEGER,
    "reachedAyah" INTEGER,
    "outOfOrder" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaraqiPlacement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaraqiPlacement_studentId_key" ON "MaraqiPlacement"("studentId");

-- ═══ ق٥: انتقالٌ برنامجيٌّ مؤجَّلٌ بالتاريخ (كسولٌ، race-safe) — حقولٌ على الطالب ═══
ALTER TABLE "Student" ADD COLUMN "pendingProgramId" TEXT;
ALTER TABLE "Student" ADD COLUMN "pendingTrackId" TEXT;
ALTER TABLE "Student" ADD COLUMN "pendingFrom" DATE;

-- ═══ ق٦: تاريخ البرامج (دخل/خرج/السبب/الفاعل) — جدولٌ متأخّرٌ بلا FK ═══
CREATE TYPE "ProgramHistoryReason" AS ENUM ('ASSIGNMENT', 'READING_TEST', 'GRADUATION', 'CHANGE');
CREATE TABLE "ProgramEnrollmentHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "reason" "ProgramHistoryReason" NOT NULL,
    "actorId" TEXT,
    CONSTRAINT "ProgramEnrollmentHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgramEnrollmentHistory_studentId_idx" ON "ProgramEnrollmentHistory"("studentId");
