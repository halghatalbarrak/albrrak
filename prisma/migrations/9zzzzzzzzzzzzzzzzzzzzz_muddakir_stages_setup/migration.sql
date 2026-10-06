-- المُدَّكِر — المرحلة ٧: جدول سرد المرحلة والسرد الختاميّ (يعتمد «_muddakir_stages_enum» قبله:
-- قيم CertificateTemplate و MuddakirErrorSource مُضافةٌ ومُثبَّتةٌ في معاملةٍ سابقة). جدولٌ ملحقٌ
-- بلا FK (نمط الترحيلات المتأخّرة الآمن، كعُرف المستودع). نوعُ السرد enum جديدٌ يُنشأ هنا.

CREATE TYPE "MuddakirRecitationKind" AS ENUM ('STAGE', 'FINAL');

CREATE TABLE "MuddakirRecitation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "MuddakirRecitationKind" NOT NULL DEFAULT 'STAGE',
    "stage" INTEGER NOT NULL, -- رقم المرحلة ١..٦ (وللسرد الختاميّ: ٦)
    "passed" BOOLEAN NOT NULL,
    "examinerId" TEXT NOT NULL, -- المختبِر (RECITER)
    "certificateId" TEXT, -- الشهادة الصادرة عند الاجتياز
    "recitedOn" DATE NOT NULL, -- يوم السرد بتوقيت مكّة (لدفعة تأكيد الأسبوع)
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MuddakirRecitation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MuddakirRecitation_studentId_idx" ON "MuddakirRecitation"("studentId");
CREATE INDEX "MuddakirRecitation_studentId_recitedOn_idx" ON "MuddakirRecitation"("studentId", "recitedOn");
