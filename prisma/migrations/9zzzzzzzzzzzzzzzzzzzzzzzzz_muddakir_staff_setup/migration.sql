-- المدّكر — جدول إسناد أدوار البرنامج (§٢): مَن عُيّن بأيّ دورٍ ومَن عيّنه ومتى. append-only،
-- الإنهاء بـendedAt (لا حذف). بلا FK (نمط الجداول المتأخّرة الآمن). يعتمد «_muddakir_staff_enum».
CREATE TABLE "MuddakirStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MuddakirStaffRole" NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "MuddakirStaff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MuddakirStaff_userId_endedAt_idx" ON "MuddakirStaff"("userId", "endedAt");
CREATE INDEX "MuddakirStaff_role_endedAt_idx" ON "MuddakirStaff"("role", "endedAt");
