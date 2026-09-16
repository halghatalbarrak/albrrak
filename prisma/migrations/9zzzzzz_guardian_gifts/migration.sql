-- م٦ب-٢ (هدايا وليّ الأمر): ECONOMY_RULES.md الركن ٢-ب. امتدادٌ لنموذج الثمرة القائم.
-- الاسم «9zzzzzz» ليُطبَّق معجميًّا بعد كل الترحيلات (يقع بعد «9zzzzz_market»).
-- كلّ الحقول بقيمٍ افتراضيّة لا تكسر الثمرات القائمة: addedBy=null (الإدارة) ·
-- target=null (عامّة) · approvalStatus=APPROVED (معروضة) · proposedPrice=null.
-- إنشاء النوع الجديد واستعماله في العمود ذرّيٌّ آمن (نوعٌ جديد لا ADD VALUE على قائم).

-- CreateEnum
CREATE TYPE "MarketItemApproval" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- AlterTable
ALTER TABLE "MarketItem" ADD COLUMN "addedByUserId" TEXT;
ALTER TABLE "MarketItem" ADD COLUMN "targetStudentId" TEXT;
ALTER TABLE "MarketItem" ADD COLUMN "approvalStatus" "MarketItemApproval" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "MarketItem" ADD COLUMN "proposedPricePoints" INTEGER;

-- CreateIndex
CREATE INDEX "MarketItem_approvalStatus_idx" ON "MarketItem"("approvalStatus");

-- CreateIndex
CREATE INDEX "MarketItem_targetStudentId_idx" ON "MarketItem"("targetStudentId");
