-- م١+ : توسعة نموذج القيد — صفة القرابة (جدول)، جهة اتصال الطوارئ، وسجل الاطّلاع عليها.
-- مولّد بلا اتصال عبر `prisma migrate diff` ثم أُلحق به حذف الصفّ الاختباري وإغلاق RLS.
--
-- جدول Application يحمل صفًّا اختباريًّا واحدًا لا قيمة له. إضافة أعمدة NOT NULL
-- تفشل ما دام فيه صفّ، ولا نخترع قيمةً افتراضية ولا نجعلها اختياريةً ثم نُشدّدها.
-- القرار: نحذف الصفّ أولًا، ثم نضيف الأعمدة إلزاميةً نظيفةً.

DELETE FROM "Application";

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "emergencyName" TEXT NOT NULL,
ADD COLUMN     "emergencyPhone" TEXT NOT NULL,
ADD COLUMN     "emergencyRelationId" TEXT NOT NULL,
ADD COLUMN     "guardianRelationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GuardianLink" ADD COLUMN     "relationId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "emergencyRelationId" TEXT;

-- CreateTable
CREATE TABLE "EmergencyAccessLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianRelation" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GuardianRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmergencyAccessLog_studentId_idx" ON "EmergencyAccessLog"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianRelation_nameAr_key" ON "GuardianRelation"("nameAr");

-- AddForeignKey
ALTER TABLE "EmergencyAccessLog" ADD CONSTRAINT "EmergencyAccessLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_emergencyRelationId_fkey" FOREIGN KEY ("emergencyRelationId") REFERENCES "GuardianRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "GuardianRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_guardianRelationId_fkey" FOREIGN KEY ("guardianRelationId") REFERENCES "GuardianRelation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_emergencyRelationId_fkey" FOREIGN KEY ("emergencyRelationId") REFERENCES "GuardianRelation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────
--  إغلاق RLS على الجدولين الجديدين (بلا سياسة مفتوحة — anon ⟵ لا شيء).
--  الوصول عبر دالّة خدمة بدور مميّز فقط.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "GuardianRelation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyAccessLog" ENABLE ROW LEVEL SECURITY;
