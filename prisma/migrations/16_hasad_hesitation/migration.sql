-- الحكم ٧ (المرحلة ٣): تخزين التردّد في الحصاد. جدولٌ مستقلٌّ بلا FK (كنمط ArifAppointment)
-- تفاديًا لترتيب الترحيلات المعجميّ. التردّد يُنسب للوجه (صفحة)؛ ثلاثٌ فيه = خطأ (وقت التقدير).
CREATE TABLE "HasadHesitation" (
    "id" TEXT NOT NULL,
    "hasadId" TEXT NOT NULL,
    "faceNo" INTEGER NOT NULL,
    CONSTRAINT "HasadHesitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HasadHesitation_hasadId_idx" ON "HasadHesitation"("hasadId");
