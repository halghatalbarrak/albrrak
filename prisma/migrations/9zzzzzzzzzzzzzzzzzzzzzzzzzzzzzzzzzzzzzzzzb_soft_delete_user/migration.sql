-- الحذف الناعم للمستخدم — deletedAt / deletedById على User.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletedById" TEXT;

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
