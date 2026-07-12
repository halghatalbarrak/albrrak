-- ============================================================
--  المرحلة ١: جدول طلبات المعلمين (teacher_applications)
--  بيانات حسّاسة (هوية، ميلاد) → محميّة: يقرأها الكادر فقط
--  (هذا الملف يعكس ما طُبّق فعلاً في القاعدة.)
-- ============================================================

create table if not exists public.teacher_applications (
  id            bigint generated always as identity primary key,
  -- البيانات الشخصية
  full_name     text    not null,              -- الاسم كما في الهوية
  id_number     text    not null,              -- رقم الهوية
  id_type       text    not null,              -- نوع الهوية (مواطن/مقيم/زائر)
  nationality   text    not null,              -- الجنسية
  birth_date    date    not null,              -- تاريخ الميلاد (ميلادي)
  gender        text    not null,              -- الجنس (ذكر/أنثى)
  marital_status text   not null,              -- الحالة الاجتماعية
  id_expiry     date    not null,              -- تاريخ انتهاء الهوية (ميلادي)
  phone         text    not null,              -- رقم الجوال
  qualification text    not null,              -- المؤهّل الدراسي
  hired_before  boolean not null default false,-- هل عُيّن في الجمعية؟
  -- إدارة الطلب
  status        text    not null default 'new',-- new/review/interview/accepted/assigned/rejected
  source        text    not null default 'form',-- form (رابط عام) أو manual (إدخال المشرف)
  notes         text,                          -- ملاحظات الكادر
  created_at    timestamptz not null default now()
);

-- العمر يُحسب تلقائياً من تاريخ الميلاد (لا يُخزَّن، يُشتقّ عند القراءة)
create or replace function public.age_years(d date)
returns integer language sql immutable as $$
  select extract(year from age(d))::int;
$$;

-- فهرسة للبحث بالحالة
create index if not exists idx_teacher_apps_status on public.teacher_applications(status);

-- ============================================================
--  الحماية (RLS)
-- ============================================================
alter table public.teacher_applications enable row level security;

-- 1) الرابط العام: يُسمح بإدراج طلب جديد فقط (لا قراءة)
drop policy if exists tapps_public_insert on public.teacher_applications;
create policy tapps_public_insert on public.teacher_applications
for insert to anon, authenticated
with check ( status = 'new' and source = 'form' );

-- 2) الكادر (مشرف/إداري): قراءة وتعديل كل الطلبات
drop policy if exists tapps_staff_read on public.teacher_applications;
create policy tapps_staff_read on public.teacher_applications
for select using (
  exists (select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('general','admin'))
);

drop policy if exists tapps_staff_write on public.teacher_applications;
create policy tapps_staff_write on public.teacher_applications
for update using (
  exists (select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('general','admin'))
);

-- 3) الإدخال اليدوي من الكادر (source='manual') مسموح لهم
drop policy if exists tapps_staff_insert on public.teacher_applications;
create policy tapps_staff_insert on public.teacher_applications
for insert to authenticated
with check (
  exists (select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('general','admin'))
);
