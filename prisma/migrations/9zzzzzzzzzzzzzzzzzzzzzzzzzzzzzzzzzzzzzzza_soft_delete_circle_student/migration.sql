-- ترحيل إضافي: أعمدة الحذف الناعم لـCircle وStudent + جدول AuditLog.
-- لا DROP ولا تعديل أعمدة قائمة — آمن عند الإعادة (IF NOT EXISTS).

-- ── Circle ──────────────────────────────────────────────────────────────
ALTER TABLE "Circle"
  ADD COLUMN IF NOT EXISTS "deletedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

CREATE INDEX IF NOT EXISTS "Circle_deletedAt_idx" ON "Circle" ("deletedAt");

-- ── Student ──────────────────────────────────────────────────────────────
ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "deletedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

CREATE INDEX IF NOT EXISTS "Student_deletedAt_idx" ON "Student" ("deletedAt");

-- ── AuditLog ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"       TEXT         NOT NULL,
  "action"   TEXT         NOT NULL, -- DELETE | RESTORE | PURGE
  "entity"   TEXT         NOT NULL, -- Circle | Student | ...
  "entityId" TEXT         NOT NULL,
  "actorId"  TEXT         NOT NULL,
  "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "label"    TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog" ("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx"          ON "AuditLog" ("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_at_idx"               ON "AuditLog" ("at");
