-- AlterTable: إضافة حقل requiresPresent إلى PointItem (بلا أثر رجعيّ — القيمة المبدئية false)
ALTER TABLE "PointItem" ADD COLUMN "requiresPresent" BOOLEAN NOT NULL DEFAULT false;
