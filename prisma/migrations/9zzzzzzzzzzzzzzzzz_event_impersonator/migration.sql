-- انتحال الشخصيّة (م: Impersonation): توثيقٌ مزدوجٌ في سجلّ الأثر — الفاعل الحقيقيّ
-- (المدير التقنيّ) إلى جانب الفاعل الفعليّ (المنتحَل). حقلٌ إضافيٌّ لا يمسّ الموجود.
ALTER TABLE "Event" ADD COLUMN "impersonatorId" TEXT;
CREATE INDEX "Event_impersonatorId_idx" ON "Event"("impersonatorId");
