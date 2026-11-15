-- فهرس على GuardianLink.studentId لتسريع البحث عن «أولياء الطالب» (بالطالب ابتداءً).
-- الاتجاه الآخر (guardianId) مغطّىً بـ@@unique([guardianId, studentId]).
CREATE INDEX IF NOT EXISTS "GuardianLink_studentId_idx" ON "GuardianLink"("studentId");
