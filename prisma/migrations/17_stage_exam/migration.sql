-- الحكم ٧ (المرحلة ٦): اختبار المرحلة الأصلية. جدولٌ مستقلٌّ بلا FK (كنمط ArifAppointment)
-- تفاديًا لترتيب الترحيلات المعجميّ. النطاق كامل المحفوظ، المُختبِر محايد، الجلسات بعدد الأحزاب.
CREATE TYPE "StageExamStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'FAILED');

CREATE TABLE "StageExam" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mainStageId" TEXT NOT NULL,
    "examinerId" TEXT NOT NULL,
    "hizbCount" INTEGER NOT NULL,
    "plannedSessions" INTEGER NOT NULL,
    "startedOn" DATE NOT NULL,
    "status" "StageExamStatus" NOT NULL,
    "finalRank" "HasadResult",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageExam_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StageExam_studentId_idx" ON "StageExam"("studentId");
