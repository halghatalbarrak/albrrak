-- الفكرة ٩: بريد وليّ الأمر (اختياريّ) + جدول رسائل وليّ الأمر.
-- الاسم «9z» ليُطبَّق معجميًّا بعد كل الترحيلات (وجودُ Application شرطٌ للتعديل).

ALTER TABLE "Application" ADD COLUMN "guardianEmail" TEXT;

CREATE TABLE "GuardianMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refDate" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    CONSTRAINT "GuardianMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuardianMessage_studentId_kind_refDate_key" ON "GuardianMessage"("studentId", "kind", "refDate");
CREATE INDEX "GuardianMessage_studentId_idx" ON "GuardianMessage"("studentId");
