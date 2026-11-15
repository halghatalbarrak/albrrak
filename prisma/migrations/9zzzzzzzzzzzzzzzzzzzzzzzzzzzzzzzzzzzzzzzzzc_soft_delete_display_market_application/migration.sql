-- الحذف الناعم: DisplayScreen / DisplaySchedule / MarketItem / PointItem / Application

ALTER TABLE "DisplayScreen"   ADD COLUMN "deletedAt"   TIMESTAMP(3);
ALTER TABLE "DisplayScreen"   ADD COLUMN "deletedById" TEXT;
CREATE INDEX "DisplayScreen_deletedAt_idx"   ON "DisplayScreen"("deletedAt");

ALTER TABLE "DisplaySchedule" ADD COLUMN "deletedAt"   TIMESTAMP(3);
ALTER TABLE "DisplaySchedule" ADD COLUMN "deletedById" TEXT;
CREATE INDEX "DisplaySchedule_deletedAt_idx" ON "DisplaySchedule"("deletedAt");

ALTER TABLE "MarketItem"      ADD COLUMN "deletedAt"   TIMESTAMP(3);
ALTER TABLE "MarketItem"      ADD COLUMN "deletedById" TEXT;
CREATE INDEX "MarketItem_deletedAt_idx"      ON "MarketItem"("deletedAt");

ALTER TABLE "PointItem"       ADD COLUMN "deletedAt"   TIMESTAMP(3);
ALTER TABLE "PointItem"       ADD COLUMN "deletedById" TEXT;
CREATE INDEX "PointItem_deletedAt_idx"       ON "PointItem"("deletedAt");

ALTER TABLE "Application"     ADD COLUMN "deletedAt"   TIMESTAMP(3);
ALTER TABLE "Application"     ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Application_deletedAt_idx"     ON "Application"("deletedAt");
