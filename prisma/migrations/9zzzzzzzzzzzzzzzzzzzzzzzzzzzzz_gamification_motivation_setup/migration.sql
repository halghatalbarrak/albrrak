-- التلعيب (ل٦): جدول قوالب رسائل التحفيز.
CREATE TABLE "MotivationTemplate" (
    "id" TEXT NOT NULL,
    "kind" "MotivationKind" NOT NULL,
    "textAr" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MotivationTemplate_kind_key" ON "MotivationTemplate"("kind");
