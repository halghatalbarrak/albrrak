-- DropForeignKey
ALTER TABLE "Circle" DROP CONSTRAINT "Circle_programId_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_circleId_fkey";

-- AlterTable
ALTER TABLE "Enrollment" ALTER COLUMN "circleId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
