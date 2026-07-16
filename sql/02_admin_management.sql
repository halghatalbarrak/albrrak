-- ============================================================
--  إدارة المستخدمين + الإشراف الشامل — للمشرف العام فقط
-- ============================================================

-- (0) عمود حالة الحساب: active / disabled  (الحذف = تعطيل آمن)
alter table public.profiles
  add column if not exists status text not null default 'active';

-- ============================================================
--  دالة مساعدة: هل المستخدم الحالي مشرف عام تحديداً؟
--  security definer لتتجاوز RLS بأمان عند قراءة الدور
-- ============================================================
create or replace function public.app_is_general()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'general',
    false
  );
$$;

-- ============================================================
--  سياسة: المشرف العام يقرأ كل ملفّات المستخدمين
--  (تُضاف بجانب سياسة "المستخدم يقرأ ملفّه" القائمة)
-- ============================================================
drop policy if exists profiles_general_read on public.profiles;
create policy profiles_general_read on public.profiles
for select using ( public.app_is_general() );

-- ============================================================
--  دالة ترقية/تغيير دور مستخدم — للمشرف العام فقط
--  تمنع الترقية لأدوار غير معروفة، وتوثّق العملية في السجل
-- ============================================================
create or replace function public.admin_set_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  target_name text;
begin
  -- تحقّق: المنفّذ مشرف عام
  if not public.app_is_general() then
    raise exception 'غير مصرّح: هذه العملية للمشرف العام فقط';
  end if;
  -- تحقّق: الدور المطلوب من القائمة المعتمدة
  if new_role not in ('general','admin','teacher','examiner','parent','student','sponsor') then
    raise exception 'دور غير معروف: %', new_role;
  end if;

  update public.profiles set role = new_role where id = target_id;

  -- توثيق
  select full_name into actor_name  from public.profiles where id = auth.uid();
  select full_name into target_name from public.profiles where id = target_id;
  insert into public.audit_log(actor, action)
  values (coalesce(actor_name,'مشرف'),
          'تغيير دور المستخدم «'||coalesce(target_name,'—')||'» إلى '||new_role);
end;
$$;

-- ============================================================
--  دالة تعطيل/تفعيل مستخدم (الحذف الآمن) — للمشرف العام فقط
-- ============================================================
create or replace function public.admin_set_status(target_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  target_name text;
begin
  if not public.app_is_general() then
    raise exception 'غير مصرّح: هذه العملية للمشرف العام فقط';
  end if;
  if new_status not in ('active','disabled') then
    raise exception 'حالة غير معروفة: %', new_status;
  end if;
  -- منع المشرف من تعطيل نفسه (حماية من قفل النفس خارج النظام)
  if target_id = auth.uid() then
    raise exception 'لا يمكنك تعطيل حسابك الخاص';
  end if;

  update public.profiles set status = new_status where id = target_id;

  select full_name into actor_name  from public.profiles where id = auth.uid();
  select full_name into target_name from public.profiles where id = target_id;
  insert into public.audit_log(actor, action)
  values (coalesce(actor_name,'مشرف'),
          (case when new_status='disabled' then 'تعطيل' else 'تفعيل' end)
          ||' المستخدم «'||coalesce(target_name,'—')||'»');
end;
$$;

-- منح صلاحية استدعاء الدوال للمستخدمين المسجّلين (الحماية داخلها)
grant execute on function public.admin_set_role(uuid, text)   to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
