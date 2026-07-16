-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'CIRCLE_MANAGER', 'REGISTRAR', 'TEACHER', 'RECITER', 'ARIF', 'STUDENT', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "TimeSlot" AS ENUM ('ASR', 'MAGHRIB');

-- CreateEnum
CREATE TYPE "ProgramKey" AS ENUM ('QAIDAH_MADANIYYAH', 'MARAQI', 'WEEKLY');

-- CreateEnum
CREATE TYPE "StudentState" AS ENUM ('APPLIED', 'PENDING_ACCEPTANCE', 'WAITLISTED', 'REJECTED', 'AWAITING_READING_TEST', 'IN_QAIDAH', 'AWAITING_PACE_TEST', 'PACE_RETEST_SCHEDULED', 'IN_MARAQI', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GuardianLinkStatus" AS ENUM ('ACTIVE', 'UNLINK_REQUESTED', 'UNLINKED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('PLACEMENT_DECISION', 'MILESTONE_TRANSITION', 'SUBSTAGE_TRANSITION', 'STAGE_TRANSITION', 'ABSENCE_EXCUSE', 'TRACK_PROMOTION', 'TRACK_DEMOTION', 'GUARDIAN_UNLINK');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('CHAPTER', 'MILESTONE', 'MAIN_STAGE', 'SUB_STAGE');

-- CreateEnum
CREATE TYPE "ProgressState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AWAITING_HASAD', 'REPAIRING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT_UNEXCUSED', 'ABSENT_EXCUSED', 'LATE', 'PRE_EXCUSED', 'LEFT_EARLY');

-- CreateEnum
CREATE TYPE "HasadResult" AS ENUM ('EXCELLENT', 'PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "HasadErrorType" AS ENUM ('WORD', 'LETTER', 'FORGOTTEN_AYAH');

-- CreateEnum
CREATE TYPE "CertificateTemplate" AS ENUM ('QAIDAH', 'SUB_STAGE', 'MAIN_STAGE', 'KHATM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nameAsInId" TEXT NOT NULL,
    "nationalId" TEXT,
    "nationality" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" "Gender" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "roles" "Role"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NationalIdAccessLog" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "reason" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NationalIdAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "key" "ProgramKey" NOT NULL,
    "nameAr" TEXT NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "timeSlot" "TimeSlot" NOT NULL,
    "location" TEXT,
    "gender" "Gender" NOT NULL,
    "programId" TEXT NOT NULL,

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleTeacher" (
    "circleId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CircleTeacher_pkey" PRIMARY KEY ("circleId","teacherId")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "StudentState" NOT NULL DEFAULT 'APPLIED',
    "schoolStage" TEXT,
    "priorHifzAmount" TEXT,
    "priorHifzLocations" JSONB,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianLink" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "GuardianLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "unlinkReason" TEXT,
    "unlinkDecidedBy" TEXT,
    "unlinkDecisionNote" TEXT,

    CONSTRAINT "GuardianLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "payload" JSONB,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionDelegation" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "holderRole" "Role" NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PermissionDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "nameAr" TEXT NOT NULL,
    "parentId" TEXT,
    "weight" INTEGER,
    "objectives" JSONB,
    "teacherNotes" TEXT,
    "fromSurah" INTEGER,
    "fromAyah" INTEGER,
    "toSurah" INTEGER,
    "toAyah" INTEGER,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "state" "ProgressState" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attendanceDays" INTEGER NOT NULL DEFAULT 0,
    "readyDeclaredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "linesPerDay" DOUBLE PRECISION NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "TrackAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaceTest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "administeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "linesMemorized" DOUBLE PRECISION,
    "assignedTrackId" TEXT,

    CONSTRAINT "PaceTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PacePassage" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "fromSurah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toSurah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PacePassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hifzFromSurah" INTEGER,
    "hifzFromAyah" INTEGER,
    "hifzToSurah" INTEGER,
    "hifzToAyah" INTEGER,
    "hifzAttempts" INTEGER,
    "hifzMastered" BOOLEAN,
    "hifzTeacherId" TEXT,
    "tarseekhDone" BOOLEAN,
    "tarseekhListenerId" TEXT,
    "murajaahDone" BOOLEAN,
    "murajaahListenerId" TEXT,
    "tajweedFlagged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "recordedBy" TEXT NOT NULL,
    "excuseAcceptedBy" TEXT,
    "excuseAcceptedAt" TIMESTAMP(3),

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hasad" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "reciterId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "conductedAt" TIMESTAMP(3),
    "fromSurah" INTEGER NOT NULL,
    "fromAyah" INTEGER NOT NULL,
    "toSurah" INTEGER NOT NULL,
    "toAyah" INTEGER NOT NULL,
    "result" "HasadResult",
    "attemptNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Hasad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HasadPageError" (
    "id" TEXT NOT NULL,
    "hasadId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "errorType" "HasadErrorType" NOT NULL,
    "surah" INTEGER,
    "ayah" INTEGER,

    CONSTRAINT "HasadPageError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "template" "CertificateTemplate" NOT NULL,
    "isExcellent" BOOLEAN NOT NULL DEFAULT false,
    "stageId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifyToken" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_nationalId_key" ON "User"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "NationalIdAccessLog_subjectId_idx" ON "NationalIdAccessLog"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Program_key_key" ON "Program"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_endedAt_idx" ON "Enrollment"("studentId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianLink_guardianId_studentId_key" ON "GuardianLink"("guardianId", "studentId");

-- CreateIndex
CREATE INDEX "Approval_status_kind_idx" ON "Approval"("status", "kind");

-- CreateIndex
CREATE INDEX "Approval_proposedAt_idx" ON "Approval"("proposedAt");

-- CreateIndex
CREATE INDEX "PermissionDelegation_capability_revokedAt_idx" ON "PermissionDelegation"("capability", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_programId_kind_ordinal_key" ON "Stage"("programId", "kind", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "StageProgress_studentId_stageId_key" ON "StageProgress"("studentId", "stageId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_programId_ordinal_key" ON "Track"("programId", "ordinal");

-- CreateIndex
CREATE INDEX "TrackAssignment_studentId_endedAt_idx" ON "TrackAssignment"("studentId", "endedAt");

-- CreateIndex
CREATE INDEX "DailySession_circleId_date_idx" ON "DailySession"("circleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_studentId_date_key" ON "DailySession"("studentId", "date");

-- CreateIndex
CREATE INDEX "Attendance_circleId_date_idx" ON "Attendance"("circleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_date_key" ON "Attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "Hasad_studentId_stageId_idx" ON "Hasad"("studentId", "stageId");

-- CreateIndex
CREATE INDEX "HasadPageError_pageNo_idx" ON "HasadPageError"("pageNo");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_verifyToken_key" ON "Certificate"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_programId_key_key" ON "Setting"("programId", "key");

-- AddForeignKey
ALTER TABLE "NationalIdAccessLog" ADD CONSTRAINT "NationalIdAccessLog_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleTeacher" ADD CONSTRAINT "CircleTeacher_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleTeacher" ADD CONSTRAINT "CircleTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageProgress" ADD CONSTRAINT "StageProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageProgress" ADD CONSTRAINT "StageProgress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackAssignment" ADD CONSTRAINT "TrackAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackAssignment" ADD CONSTRAINT "TrackAssignment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySession" ADD CONSTRAINT "DailySession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hasad" ADD CONSTRAINT "Hasad_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HasadPageError" ADD CONSTRAINT "HasadPageError_hasadId_fkey" FOREIGN KEY ("hasadId") REFERENCES "Hasad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════
--  م٠ — إغلاق القاعدة (Row Level Security)
-- ───────────────────────────────────────────────────────────────────
--  تُفعَّل RLS على كل جدول بلا إنشاء أي سياسة.
--  الأثر: كل وصول من دورَي Supabase العامّين (anon / authenticated)
--  يُرفض ⟵ SELECT يُرجع صفوفًا صفرية ([])، وWRITE يُرفض.
--  التطبيق يصل عبر Prisma بدور القاعدة المميّز الذي يتجاوز RLS.
--  لا توجد — ولن توجد — سياسة مفتوحة بلا شرط. سياسات الأدوار التفصيلية
--  (SELECT/INSERT/UPDATE حسب الدور) تأتي في م١+ عند بناء نموذج الوصول.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NationalIdAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Circle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CircleTeacher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuardianLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Approval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PermissionDelegation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StageProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Track" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaceTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PacePassage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailySession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Hasad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HasadPageError" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
