-- حالة الجلسة «مؤجَّل» (مشترَكة بين مراقي والقاعدة): جدولٌ محايدٌ إيجابيّ — الطالب حاضرٌ لم
-- يُسمَّع/يُقيَّم لضيق الوقت. لا يحرّك الموضع ولا يمنح/يخصم. الاسم «9zzzzzzzzzz» (عشرة z)
-- ليُطبَّق معجميًّا بعد «9zzzzzzzzz_qaidah_lessons_seed». بلا FK (نمط الجداول المتأخّرة). إضافةٌ محضة.

-- CreateTable
CREATE TABLE "DeferredSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeferredSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (مؤجَّل مرّةً لليوم للطالب الواحد — idempotent)
CREATE UNIQUE INDEX "DeferredSession_studentId_date_key" ON "DeferredSession"("studentId", "date");

-- CreateIndex
CREATE INDEX "DeferredSession_studentId_idx" ON "DeferredSession"("studentId");
