-- البند ١ (اختبار المرحلة والإجازة): إجازةٌ تبدأ تلقائيًّا بإتمام كل أحزاب المرحلة الأصلية،
-- ٧ أيّام تقويميّة، للمعلّم تأجيلٌ واحد (+٧) والمتكرّر بيد الإدارة (+٧ لكلٍّ). الاسم «9zzzzzzzzzzz»
-- (١١ z) ليُطبَّق معجميًّا بعد «9zzzzzzzzzz_deferred_session». بلا FK (نمط الجداول المتأخّرة). إضافةٌ محضة.

-- CreateTable
CREATE TABLE "StageExamLeave" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mainStageId" TEXT NOT NULL,
    "startedOn" DATE NOT NULL,
    "baseEndsOn" DATE NOT NULL,
    "teacherDeferredOnce" BOOLEAN NOT NULL DEFAULT false,
    "adminDeferrals" INTEGER NOT NULL DEFAULT 0,
    "effectiveEndsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageExamLeave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (إجازةٌ واحدةٌ لكل طالبٍ لكل مرحلةٍ أصلية — idempotent لبدء الإجازة)
CREATE UNIQUE INDEX "StageExamLeave_studentId_mainStageId_key" ON "StageExamLeave"("studentId", "mainStageId");

-- CreateIndex (لقائمة الجاهزين: انقضاء المهلة)
CREATE INDEX "StageExamLeave_effectiveEndsOn_idx" ON "StageExamLeave"("effectiveEndsOn");

-- CreateIndex
CREATE INDEX "StageExamLeave_studentId_idx" ON "StageExamLeave"("studentId");
