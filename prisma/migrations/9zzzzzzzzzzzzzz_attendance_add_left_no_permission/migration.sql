-- المرحلة (أ) من شاشة التشغيل الموحّدة: إضافة حالة الحضور «خرج بدون إذن» — إضافيّةٌ محضة،
-- بلا قلب الأصل (القلب يأتي مع الشاشة الموحّدة، المرحلة ج). الاسم «9zzzzzzzzzzzzzz» (١٤ z)
-- ليُطبَّق معجميًّا بعد «9zzzzzzzzzzzzz_track_units». ADD VALUE وحده (لا يُستعمل القيمة الجديدة
-- في نفس المعاملة — قيد Postgres) — وترحيل البيانات في الترحيل التالي المنفصل.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'LEFT_NO_PERMISSION';
