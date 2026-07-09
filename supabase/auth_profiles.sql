-- ============================================================
-- إضافة نظام الحسابات (تسجيل الدخول بالجوال وكلمة السر)
-- شغّل هذا الملف مرّة واحدة في: Supabase → SQL Editor → Run
-- (بعد schema.sql)
-- ============================================================

-- جدول الملفات الشخصية — مرتبط بمستخدمي المصادقة
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text,
  full_name   text,
  role        text default 'parent',   -- general/teacher/admin/examiner/parent/student/sponsor
  student_id  bigint references students(id),
  guardian_id text references guardians(id),
  created_at  timestamptz default now()
);

alter table profiles enable row level security;

-- سياسات مبدئية للنموذج: كل مستخدمٍ مُصادَق يقرأ/يكتب ملفه.
drop policy if exists p_profile_self on profiles;
create policy p_profile_self on profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- السماح لأي مُصادَق بقراءة الأدوار العامة (يُشدّد لاحقاً حسب RBAC).
drop policy if exists p_profile_read on profiles;
create policy p_profile_read on profiles
  for select using (auth.role() = 'authenticated');

-- تم بحمد الله
