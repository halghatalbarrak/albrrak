-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WAITLISTED');

-- CreateTable
CREATE TABLE "Nationality" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ordinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Nationality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStage" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "nameAsInId" TEXT NOT NULL,
    "nationalIdEnc" TEXT NOT NULL,
    "nationalityId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "schoolStageId" TEXT,
    "guardianPhone" TEXT NOT NULL,
    "studentPhone" TEXT,
    "priorHifzJuz" INTEGER,
    "priorHifzNotes" TEXT,
    "preferredCircleId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nationality_nameAr_key" ON "Nationality"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStage_nameAr_key" ON "SchoolStage"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "Application_studentId_key" ON "Application"("studentId");

-- CreateIndex
CREATE INDEX "Application_status_createdAt_idx" ON "Application"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_nationalityId_fkey" FOREIGN KEY ("nationalityId") REFERENCES "Nationality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_schoolStageId_fkey" FOREIGN KEY ("schoolStageId") REFERENCES "SchoolStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────────────────────────────────────────────────────────────
--  م١: إغلاق RLS على الجداول الجديدة (بلا سياسة مفتوحة).
--  لا سياسة anon insert: النموذج العام يمرّ عبر Route Handler بدور مميّز.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "Nationality" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────
--  بذرة المراحل الدراسية — بداية قابلة للتعديل (المدير يزيد/يعدّل).
-- ───────────────────────────────────────────────────────────────────
INSERT INTO "SchoolStage" ("id", "nameAr", "ordinal", "isActive") VALUES
  ('ss_ibtidai',    'ابتدائي', 1, true),
  ('ss_mutawassit', 'متوسط',   2, true),
  ('ss_thanawi',    'ثانوي',   3, true),
  ('ss_jamii',      'جامعي',   4, true),
  ('ss_ghayr',      'غير ذلك', 5, true)
ON CONFLICT ("nameAr") DO NOTHING;
