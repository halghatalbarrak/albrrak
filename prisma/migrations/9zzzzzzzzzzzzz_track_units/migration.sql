-- البند ٢ (المرحلة ٣): وحدات المسارات المُجهَّزة — القرآن مقسّمٌ مسبقًا لكل مسارٍ بمقداره إلى
-- وحداتٍ بحدود آيات، مرقّمةً بترتيب حفظ مراقي. تُبذَر بسكربتٍ منفصل. الاسم «9zzzzzzzzzzzzz»
-- (١٣ z) ليُطبَّق معجميًّا بعد «9zzzzzzzzzzzz_mushaf_line». بلا FK (نمط الجداول المتأخّرة). إضافةٌ محضة.

-- CreateTable
CREATE TABLE "TrackUnit" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "unitNo" INTEGER NOT NULL,
    "startSurah" INTEGER NOT NULL,
    "startAyah" INTEGER NOT NULL,
    "endSurah" INTEGER NOT NULL,
    "endAyah" INTEGER NOT NULL,
    CONSTRAINT "TrackUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (وحدةٌ واحدةٌ لكل رقمٍ في المسار — idempotent للبذر)
CREATE UNIQUE INDEX "TrackUnit_trackId_unitNo_key" ON "TrackUnit"("trackId", "unitNo");

-- CreateIndex (بحثٌ بموضع الطالب داخل المسار)
CREATE INDEX "TrackUnit_trackId_startSurah_startAyah_idx" ON "TrackUnit"("trackId", "startSurah", "startAyah");
