-- الحكم ٥ (الترميم الموضعيّ): خطآن (تراكميًّا داخل نافذة آخر ١٠ جلسات) ⟵ يعود حفظًا جديدًا.
--  • DailySession.repairedAt: علَم الترميم — يُخرج المقطع من الراسخ (يُعاد كجديد).
--  • ReviewError: سجلّ أخطاء المراجعة لكل مقطع (تاريخ + من رصد) — لا حقل عدٍّ مجرّد.
-- إضافيّ آمن. (Prisma يطبّق معجميًّا؛ يعتمد DailySession من 0_init فقط.)
-- لم يُدمج ولم يُطبَّق على الإنتاج ⟵ عُدّل بأمان (القاعدة: المطبَّق/المدموج لا يُعدَّل).
ALTER TABLE "DailySession" ADD COLUMN "repairedAt" TIMESTAMP(3);

CREATE TABLE "ReviewError" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewError_sessionId_idx" ON "ReviewError"("sessionId");
