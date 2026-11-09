-- إضافة حقول التعليق على جدول Enrollment
ALTER TABLE "Enrollment"
  ADD COLUMN IF NOT EXISTS "suspendedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspendReturnAt" DATE;

CREATE INDEX IF NOT EXISTS "Enrollment_suspendedAt_idx" ON "Enrollment" ("suspendedAt");
