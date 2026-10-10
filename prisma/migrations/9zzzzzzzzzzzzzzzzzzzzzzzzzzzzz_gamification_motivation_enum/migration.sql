-- التلعيب (ل٦): تعداد نوع رسالة التحفيز. enum مستقلٌّ يسبق setup.
CREATE TYPE "MotivationKind" AS ENUM (
  'STREAK_AT_RISK',
  'FIRST_STEP',
  'BADGE_NEAR',
  'STATION_PROGRESS'
);
