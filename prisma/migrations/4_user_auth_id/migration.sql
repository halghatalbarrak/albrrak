-- م١: ربط User بمصادقة Supabase (authId). فارغٌ لمن دون ١٣ (م٤ بنيةً).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

