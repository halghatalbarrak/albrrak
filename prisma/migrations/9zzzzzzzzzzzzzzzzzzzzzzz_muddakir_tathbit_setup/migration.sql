-- المُدَّكِر — التثبيت (§١٢): الأعمدة والجداول والبذر. يعتمد «_muddakir_tathbit_enum» قبله
-- (MuddakirPhase وقيم CertificateTemplate/MuddakirRecitationKind مُثبَّتةٌ في معاملةٍ سابقة).
-- جداولٌ ملحقةٌ بلا FK (نمط الجداول المتأخّرة الآمن). بذرٌ idempotent.

-- ── طور الحافظ ومؤشّرات التثبيت على ملفّه ──
ALTER TABLE "MuddakirProfile" ADD COLUMN IF NOT EXISTS "phase" "MuddakirPhase" NOT NULL DEFAULT 'MEMORIZE';
ALTER TABLE "MuddakirProfile" ADD COLUMN IF NOT EXISTS "tathbitDegree" INTEGER;
ALTER TABLE "MuddakirProfile" ADD COLUMN IF NOT EXISTS "khatmaInDegree" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MuddakirProfile" ADD COLUMN IF NOT EXISTS "wardsCompleted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MuddakirProfile" ADD COLUMN IF NOT EXISTS "cumulativeKhatmat" INTEGER NOT NULL DEFAULT 0;

-- ── سلّم التثبيت (درجاتٌ يحرّرها المدير) ──
CREATE TABLE "MuddakirTathbitDegree" (
    "degreeNo" INTEGER NOT NULL,
    "dailyJuz" INTEGER NOT NULL,
    "khatmaDays" INTEGER NOT NULL,
    "khatmaCount" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MuddakirTathbitDegree_pkey" PRIMARY KEY ("degreeNo")
);

-- ── إسقاطُ يوم الورد ──
CREATE TABLE "MuddakirWardDay" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayDate" DATE NOT NULL,
    "phase" "MuddakirPhase" NOT NULL,
    "degreeNo" INTEGER NOT NULL,
    "khatmaNo" INTEGER NOT NULL,
    "status" "MuddakirDayStatus" NOT NULL DEFAULT 'OPEN',
    "wardsCompleted" INTEGER NOT NULL DEFAULT 0,
    "makeupForDate" DATE,
    CONSTRAINT "MuddakirWardDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirWardDay_studentId_dayDate_key" ON "MuddakirWardDay"("studentId", "dayDate");
CREATE INDEX "MuddakirWardDay_studentId_status_idx" ON "MuddakirWardDay"("studentId", "status");

-- ── سجلّ الرفع المبكّر (append-only) ──
CREATE TABLE "MuddakirDegreeRaise" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromDegree" INTEGER NOT NULL,
    "toDegree" INTEGER NOT NULL,
    "atKhatma" INTEGER NOT NULL,
    "bySupervisorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MuddakirDegreeRaise_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MuddakirDegreeRaise_studentId_idx" ON "MuddakirDegreeRaise"("studentId");

-- ── بذر سلّم §١٢ (جزء اليوم × أيّام الختمة × عدد الختمات)، idempotent ──
INSERT INTO "MuddakirTathbitDegree" ("degreeNo", "dailyJuz", "khatmaDays", "khatmaCount") VALUES
  (1, 1, 30, 3),
  (2, 2, 15, 2),
  (3, 3, 10, 3),
  (4, 4, 8, 4),
  (5, 5, 6, 5),
  (6, 6, 5, 6),
  (7, 7, 5, 7),
  (8, 8, 4, 8),
  (9, 9, 4, 9),
  (10, 10, 3, 10)
ON CONFLICT ("degreeNo") DO NOTHING;

-- ── إعدادات التثبيت ⚙ (§٩)، idempotent ──
INSERT INTO "Setting" ("id", "programId", "key", "value") VALUES
  ('set_mdk_weekly_surprise', 'prog_muddakir', 'weeklySurpriseJuz', '1'::jsonb),
  ('set_mdk_permanent_ward',  'prog_muddakir', 'permanentWardJuz', '10'::jsonb)
ON CONFLICT ("programId", "key") DO NOTHING;
