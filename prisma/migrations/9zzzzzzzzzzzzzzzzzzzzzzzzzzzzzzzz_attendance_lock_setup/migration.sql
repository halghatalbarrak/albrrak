-- قفل الحضور (المهمّة ٩): بذر إعداد مهلة القفل العامّ (attendance.lockGraceDays = ١).
-- صفٌّ عامٌّ بلا programId؛ يُقرأ بافتراضٍ ١ إن غاب. لا FK، ولا مساس بصفوف Attendance.
INSERT INTO "Setting" ("id", "programId", "key", "value")
VALUES ('setting_attendance_lock_grace_days', NULL, 'attendance.lockGraceDays', '1'::jsonb)
ON CONFLICT DO NOTHING;
