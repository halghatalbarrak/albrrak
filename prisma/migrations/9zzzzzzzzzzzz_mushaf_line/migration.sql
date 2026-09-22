-- البند ٢ (خريطة السطر↔الآية): صفٌّ لكل (وجه، سطر) بحدود آياته — أساس وحدات المسارات ووجهة
-- اليوم. تُبذَر بسكربتٍ منفصل (لا بالترحيل). الاسم «9zzzzzzzzzzzz» (١٢ z) ليُطبَّق معجميًّا بعد
-- «9zzzzzzzzzzz_stage_exam_leave». بلا FK (نمط الجداول المتأخّرة). إضافةٌ محضة.

-- CreateTable
CREATE TABLE "MushafLine" (
    "page" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "startSurah" INTEGER NOT NULL,
    "startAyah" INTEGER NOT NULL,
    "endSurah" INTEGER NOT NULL,
    "endAyah" INTEGER NOT NULL,
    CONSTRAINT "MushafLine_pkey" PRIMARY KEY ("page", "lineNo")
);

-- CreateIndex (بحثٌ عكسيّ: أين تقع آية؟)
CREATE INDEX "MushafLine_startSurah_startAyah_idx" ON "MushafLine"("startSurah", "startAyah");
CREATE INDEX "MushafLine_endSurah_endAyah_idx" ON "MushafLine"("endSurah", "endAyah");
