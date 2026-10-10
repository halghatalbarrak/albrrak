-- الشاشة التحفيزيّة (ش١): جداول الشاشة والرمز والشرائح والخلفيّات وحدّ المعدّل.
CREATE TABLE "DisplayScreen" (
    "id" TEXT NOT NULL,
    "kind" "DisplayScreenKind" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "studentId" TEXT,
    "refreshSec" INTEGER NOT NULL DEFAULT 180,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayScreen_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DisplayScreen_kind_active_idx" ON "DisplayScreen"("kind", "active");

CREATE TABLE "DisplayScreenToken" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DisplayScreenToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DisplayScreenToken_tokenHash_key" ON "DisplayScreenToken"("tokenHash");
CREATE INDEX "DisplayScreenToken_screenId_revokedAt_idx" ON "DisplayScreenToken"("screenId", "revokedAt");
-- رمزٌ فعّالٌ واحدٌ لكل شاشة (فهرسٌ جزئيّ).
CREATE UNIQUE INDEX "DisplayScreenToken_active_one" ON "DisplayScreenToken"("screenId") WHERE "revokedAt" IS NULL;

CREATE TABLE "DisplaySlide" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" "DisplaySlideKind" NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 20,
    "programId" TEXT,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DisplaySlide_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DisplaySlide_screenId_ordinal_idx" ON "DisplaySlide"("screenId", "ordinal");

CREATE TABLE "DisplayBackground" (
    "id" TEXT NOT NULL,
    "screenKind" "DisplayScreenKind" NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "assetType" "DisplayAssetType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayBackground_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DisplayBackground_screenKind_active_idx" ON "DisplayBackground"("screenKind", "active");

CREATE TABLE "DisplayRateHit" (
    "id" TEXT NOT NULL,
    "rkey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DisplayRateHit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DisplayRateHit_rkey_windowStart_key" ON "DisplayRateHit"("rkey", "windowStart");
