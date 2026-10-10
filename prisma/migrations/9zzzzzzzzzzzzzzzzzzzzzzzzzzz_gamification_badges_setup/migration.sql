-- التلعيب (ل١): جدولا تعريف الأوسمة ومنحها.
CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "BadgeConditionKind" NOT NULL,
    "threshold" INTEGER,
    "category" "BadgeCategory" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descAr" TEXT NOT NULL,
    "emoji" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BadgeDefinition_code_key" ON "BadgeDefinition"("code");

CREATE INDEX "BadgeDefinition_kind_active_idx" ON "BadgeDefinition"("kind", "active");

CREATE TABLE "BadgeGrant" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeDefId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceEvent" TEXT NOT NULL,
    "sourceRef" TEXT,

    CONSTRAINT "BadgeGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BadgeGrant_studentId_badgeDefId_key" ON "BadgeGrant"("studentId", "badgeDefId");

CREATE INDEX "BadgeGrant_studentId_idx" ON "BadgeGrant"("studentId");
