-- المدّكر — جدول طلبات الإداريّ (§٢): append-only؛ التنفيذ عند الموافقة بالدالّة نفسها مرّةً واحدة
-- (executedAt). بلا FK (نمط الجداول المتأخّرة الآمن). يعتمد «_muddakir_requests_enum».
CREATE TABLE "MuddakirAdminRequest" (
    "id" TEXT NOT NULL,
    "type" "MuddakirRequestType" NOT NULL,
    "payload" JSONB NOT NULL,
    "studentId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MuddakirRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    CONSTRAINT "MuddakirAdminRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MuddakirAdminRequest_status_idx" ON "MuddakirAdminRequest"("status");
CREATE INDEX "MuddakirAdminRequest_requestedBy_status_idx" ON "MuddakirAdminRequest"("requestedBy", "status");
