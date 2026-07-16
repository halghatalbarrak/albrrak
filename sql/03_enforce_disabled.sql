-- ============================================================
--  إنفاذ حالة الحساب (disabled) على مستوى RLS
--  الحساب المعطَّل يفقد الوصول لكل الجداول التشغيلية وبيانات الطلاب.
--  ملاحظة: قراءة المستخدم لملفّه (profiles) تبقى مسموحة حتى تتمكّن
--  الواجهة من اكتشاف التعطيل وإخراجه.
--  شغّله بعد: 01_add_profile_links.sql و 02_admin_management.sql
-- ============================================================

-- هل حساب المستخدم الحالي مُفعَّل؟
create or replace function public.app_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status from public.profiles where id = auth.uid()) = 'active', false)
$$;

-- إعادة تعريف الدوال المساعدة لتشترط أن يكون الحساب مُفعَّلاً
create or replace function public.app_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_active() and coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('general','admin','teacher','examiner'),
    false)
$$;

create or replace function public.app_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_active() and coalesce(
    (select role from public.profiles where id = auth.uid()) in ('general','admin'),
    false)
$$;

create or replace function public.app_is_general()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_active() and coalesce(
    (select role from public.profiles where id = auth.uid()) = 'general',
    false)
$$;

-- توحيد سياسات قراءة الطلاب وإسقاط السياسات غير المُقيَّدة بالحالة
drop policy if exists students_parent_read on public.students;
drop policy if exists students_self_read   on public.students;

drop policy if exists students_read on public.students;
create policy students_read on public.students
for select using (
  public.app_active() and (
    public.app_is_staff()
    or id = (select student_id from public.profiles where id = auth.uid())
    or guardian_id = (select guardian_id from public.profiles where id = auth.uid())
  )
);

-- قراءة وليّ الأمر لسجلّه محصورة بالحسابات المُفعَّلة
drop policy if exists guardians_self on public.guardians;
create policy guardians_self on public.guardians for select
  using (public.app_active() and id = (select guardian_id from public.profiles where id = auth.uid()));
