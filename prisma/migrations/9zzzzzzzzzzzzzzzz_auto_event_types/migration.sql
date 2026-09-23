-- المرحلة (ب) من شاشة التشغيل الموحّدة: توسيع أحداث الربط التلقائيّ (م٦أ-٢) بحالات الحضور
-- المفصّلة والمهامّ الثلاث (تمّ/لم يتمّ) والإنجاز الزائد. إضافيّةٌ محضة — ATTENDANCE العام يبقى
-- خامداً (لا يُحذف؛ حذف قيمة enum خطرٌ في Postgres). الاسم «9zzzzzzzzzzzzzzzz» (١٦ z) ليُطبَّق
-- معجميًّا أخيراً. لا تُستعمل القيم الجديدة في هذه المعاملة (قيد Postgres) — الإطلاق من الكود.
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_PRESENT';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_LATE';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_ABSENT';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_LEFT_NO_PERMISSION';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'HIFZ_DONE';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'HIFZ_MISSED';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'TARSEEKH_DONE';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'TARSEEKH_MISSED';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MURAJAAH_DONE';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MURAJAAH_MISSED';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'HIFZ_EXTRA';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'TARSEEKH_EXTRA';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MURAJAAH_EXTRA';
