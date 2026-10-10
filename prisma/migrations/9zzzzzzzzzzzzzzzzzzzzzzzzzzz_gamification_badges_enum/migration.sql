-- التلعيب (ل١): تعدادا شرط الوسام وفئته. enum مستقلٌّ يسبق setup (لا يُستعمل داخل معاملة إضافته).
CREATE TYPE "BadgeConditionKind" AS ENUM (
  'STREAK_DAYS',
  'STAGE_COMPLETE',
  'TRACK_OR_DEGREE_COMPLETE',
  'HIFZ_KHATM',
  'TATHBIT_CERTIFICATE',
  'WEEK_NO_ERROR',
  'STAGE_RECITATION_NO_ERROR',
  'FACES_HEARD_NO_ERROR',
  'FIRST_DAY',
  'FIRST_WEEK_COMPLETE'
);

CREATE TYPE "BadgeCategory" AS ENUM (
  'REGULARITY',
  'ACHIEVEMENT',
  'MASTERY',
  'ONBOARDING'
);
