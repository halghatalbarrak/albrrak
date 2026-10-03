-- المُدَّكِر — نموذج البيانات والإعدادات (المرحلة ١). يعتمد «_muddakir_enum» قبله (قيمة
-- ProgramKey.MUDDAKIR مُضافةٌ ومُثبَّتةٌ في معاملةٍ سابقة، فيصحّ استعمالها في البذر هنا).
-- جداولٌ ملحقةٌ بلا FK (نمط الترحيلات المتأخّرة الآمن). بذرٌ idempotent لصفّ البرنامج وقيم
-- Setting الافتراضيّة (§٩). لا منطق ولا شاشات.

-- ── الأنواع ──
CREATE TYPE "MuddakirMode" AS ENUM ('ACTIVE', 'REVIEW_ONLY');
CREATE TYPE "MuddakirDeliveryMode" AS ENUM ('IN_PERSON', 'REMOTE');
CREATE TYPE "MuddakirFaceState" AS ENUM ('NEW', 'IN_RIBAT', 'HEARD', 'IN_REVIEW');
CREATE TYPE "MuddakirDayStatus" AS ENUM ('OPEN', 'COMPLETE', 'PENDING_MAKEUP', 'MADE_UP', 'SHORTFALL', 'EXCUSED');
CREATE TYPE "MuddakirExcuseReason" AS ENUM ('ILLNESS', 'TRAVEL', 'EXAMS');
CREATE TYPE "MuddakirErrorSource" AS ENUM ('RIBAT', 'REVIEW', 'SUPERVISOR');

-- ── الجداول ──
CREATE TABLE "MuddakirProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "track" INTEGER NOT NULL,
    "pendingTrack" INTEGER,
    "effectiveFrom" DATE,
    "reviewCycleDays" INTEGER NOT NULL DEFAULT 7,
    "currentStageId" TEXT,
    "mode" "MuddakirMode" NOT NULL DEFAULT 'ACTIVE',
    "deliveryMode" "MuddakirDeliveryMode" NOT NULL DEFAULT 'IN_PERSON',
    CONSTRAINT "MuddakirProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirProfile_studentId_key" ON "MuddakirProfile"("studentId");

CREATE TABLE "MuddakirFace" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "state" "MuddakirFaceState" NOT NULL DEFAULT 'NEW',
    "weak" BOOLEAN NOT NULL DEFAULT false,
    "repErrors" INTEGER NOT NULL DEFAULT 0,
    "firstMemorizedOn" DATE,
    "heardAt" TIMESTAMP(3),
    "heardById" TEXT,
    "reviewEnteredOn" DATE,
    CONSTRAINT "MuddakirFace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirFace_studentId_page_key" ON "MuddakirFace"("studentId", "page");
CREATE INDEX "MuddakirFace_studentId_state_idx" ON "MuddakirFace"("studentId", "state");

CREATE TABLE "MuddakirDay" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayDate" DATE NOT NULL,
    "status" "MuddakirDayStatus" NOT NULL DEFAULT 'OPEN',
    "newFromPage" INTEGER,
    "newToPage" INTEGER,
    "ribatDone" BOOLEAN,
    "reviewDone" BOOLEAN,
    "excuseReason" "MuddakirExcuseReason",
    "completedAt" TIMESTAMP(3),
    "makeupForDayId" TEXT,
    CONSTRAINT "MuddakirDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirDay_studentId_dayDate_key" ON "MuddakirDay"("studentId", "dayDate");
CREATE INDEX "MuddakirDay_studentId_status_idx" ON "MuddakirDay"("studentId", "status");

CREATE TABLE "MuddakirDayFace" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "repErrors" INTEGER NOT NULL DEFAULT 0,
    "yesterdayReps" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MuddakirDayFace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirDayFace_dayId_page_key" ON "MuddakirDayFace"("dayId", "page");
CREATE INDEX "MuddakirDayFace_dayId_idx" ON "MuddakirDayFace"("dayId");

CREATE TABLE "MuddakirError" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "source" "MuddakirErrorSource" NOT NULL,
    "openedOn" DATE NOT NULL,
    "cleanSessions" INTEGER NOT NULL DEFAULT 0,
    "lastCleanSessionOn" DATE,
    "resolvedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    CONSTRAINT "MuddakirError_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MuddakirError_studentId_resolvedAt_idx" ON "MuddakirError"("studentId", "resolvedAt");
CREATE INDEX "MuddakirError_studentId_page_lineNo_idx" ON "MuddakirError"("studentId", "page", "lineNo");

CREATE TABLE "MuddakirWeek" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "heardCount" INTEGER NOT NULL DEFAULT 0,
    "regularityConfirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    CONSTRAINT "MuddakirWeek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirWeek_studentId_weekStart_key" ON "MuddakirWeek"("studentId", "weekStart");

CREATE TABLE "MuddakirSupervision" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "MuddakirSupervision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MuddakirSupervision_studentId_endedAt_idx" ON "MuddakirSupervision"("studentId", "endedAt");
CREATE INDEX "MuddakirSupervision_supervisorId_endedAt_idx" ON "MuddakirSupervision"("supervisorId", "endedAt");
-- قيد «نشطٌ واحدٌ لكلّ حافظ» — فهرسٌ فريدٌ جزئيّ (Prisma لا يعبّر عنه؛ نمط AutoGrant).
CREATE UNIQUE INDEX "MuddakirSupervision_active_student_key" ON "MuddakirSupervision"("studentId") WHERE "endedAt" IS NULL;

CREATE TABLE "MuddakirEvent" (
    "id" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayDate" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MuddakirEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MuddakirEvent_clientEventId_key" ON "MuddakirEvent"("clientEventId");
CREATE INDEX "MuddakirEvent_studentId_dayDate_idx" ON "MuddakirEvent"("studentId", "dayDate");

-- ── البذر (idempotent) ──
-- صفّ البرنامج بلا nextProgramId (يضبطه المدير من الإعدادات لاحقاً).
INSERT INTO "Program" ("id", "key", "nameAr") VALUES
  ('prog_muddakir', 'MUDDAKIR', 'المُدَّكِر')
ON CONFLICT ("key") DO NOTHING;

-- إعدادات المدير الافتراضيّة (§٩) في جدول Setting (value من نوع jsonb). غير المحسوم = null.
INSERT INTO "Setting" ("id", "programId", "key", "value") VALUES
  ('set_mdk_stage_juz',       'prog_muddakir', 'stageJuzCount',          '5'::jsonb),
  ('set_mdk_tracks',          'prog_muddakir', 'tracks',                 '[1, 2, 3]'::jsonb),
  ('set_mdk_new_reps',        'prog_muddakir', 'newReps',                '30'::jsonb),
  ('set_mdk_first_clean',     'prog_muddakir', 'firstCleanReps',         '3'::jsonb),
  ('set_mdk_yesterday_reps',  'prog_muddakir', 'yesterdayReps',          '10'::jsonb),
  ('set_mdk_ribat_window',    'prog_muddakir', 'ribatWindowDays',        '{"1": 20, "2": 15, "3": 10}'::jsonb),
  ('set_mdk_review_cycle',    'prog_muddakir', 'reviewCycleDays',        '7'::jsonb),
  ('set_mdk_treat_line_reps', 'prog_muddakir', 'treatmentLineReps',      '10'::jsonb),
  ('set_mdk_treat_clean',     'prog_muddakir', 'treatmentCleanSessions', '3'::jsonb),
  ('set_mdk_weak_threshold',  'prog_muddakir', 'weakFaceThreshold',      'null'::jsonb),
  ('set_mdk_max_hafiz',       'prog_muddakir', 'maxHafizPerSupervisor',  '4'::jsonb),
  ('set_mdk_meeting_day',     'prog_muddakir', 'meetingDay',             '"WEDNESDAY"'::jsonb),
  ('set_mdk_excuse_limit',    'prog_muddakir', 'monthlyExcuseLimit',     'null'::jsonb)
ON CONFLICT ("programId", "key") DO NOTHING;
