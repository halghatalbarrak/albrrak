-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_subjectType_subjectId_idx" ON "Event"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");


-- ───────────────────────────────────────────────────────────────────
--  م١: إغلاق RLS على جدول الأحداث (كبقية الجداول — بلا سياسة مفتوحة)
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────
--  م١ / DESIGN §٩٫١: انتساب نشط واحد لكل طالب.
--  فهرس فريد جزئي — لا يعبّر عنه مخطط Prisma، فيُكتب خامًا هنا.
--  يمنع وجود صفَّي Enrollment لنفس studentId وكلاهما endedAt IS NULL.
-- ───────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "Enrollment_one_active_per_student"
  ON "Enrollment" ("studentId")
  WHERE "endedAt" IS NULL;
