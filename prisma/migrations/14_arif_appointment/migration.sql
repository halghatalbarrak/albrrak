-- الحكم ٨ (العريف): تعيين العريف — المعلّم يعيّن طالباً من حلقته عريفاً.
-- يُسمِّع الترسيخ/المراجعة بإسناده، لا الحفظ الجديد ولا الاختبار. إضافيّ آمن.
-- (Prisma يطبّق معجميًّا: 14 جدولٌ مستقلّ — لا يعتمد على ٢–٩.)
CREATE TABLE "ArifAppointment" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "arifUserId" TEXT NOT NULL,
    "appointedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "ArifAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArifAppointment_circleId_endedAt_idx" ON "ArifAppointment"("circleId", "endedAt");
CREATE INDEX "ArifAppointment_arifUserId_endedAt_idx" ON "ArifAppointment"("arifUserId", "endedAt");
